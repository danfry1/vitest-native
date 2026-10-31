// Flow-strips a React Native source file via the project's React Native Babel preset
// (babel-preset.mjs; the only transformer that lowers RN's `component` syntax). Used by
// BOTH the loader hook (import) and the require hook, which run in separate threads:
// each gets its own instance of this module, so the in-memory `mem` cache below is
// per-thread (no shared mutable state to race on). The disk cache — keyed by CONTENT
// hash + platform, in a directory versioned by preset + @babel/core versions — is the
// layer shared across threads, workers, runs, and (because content-keyed entries
// survive fresh installs and mtime normalization) CI cache restores. The path is part
// of the key too — Babel output embeds the filename — so restores are valid wherever
// the checkout path is stable (CI runners use a fixed workspace path).
//
// Babel compiles on a thread of its own, started on a thread's first cache miss (see
// "Where Babel runs" below): on a warm cache the default engine pays this module's init
// in every isolated worker, and loading Babel and the preset costs ~130ms vs ~0.5ms for
// resolving versions — pure waste when every file is served from disk. App source asks
// it for its cache key, since only Babel can say which project configuration applies
// (projectBabelOptions).
import nodeModule, { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import vm from "node:vm";
import { MessageChannel, receiveMessageOnPort, SHARE_ENV, Worker } from "node:worker_threads";
import { decorateTransformError } from "./explain.mjs";
import { handleToolchainRequest } from "./babel-toolchain.mjs";
import { VitestNativeError } from "../errors.mjs";
import { resolveTransformPreset } from "./babel-preset.mjs";

// Toolchain state is scoped PER PROJECT ROOT, not per process. It used to be a
// set of module globals initialized by the first caller — but registries for
// every project in a Vitest workspace are built in the one Vite main process,
// so the first project's resolved preset, @babel/core, and cache directory
// silently served every other project. Proven by
// tests/transform-project-scope.test.ts: a second root's file came back
// stamped with the first root's Babel toolchain. Same first-caller-wins guard
// family as the hot worker's require-hook install (see hooks.mjs).
const contexts = new Map(); // canonical project root -> toolchain context

// Memoized: transformRN runs per required file, and the realpath of a project
// root cannot change within a process. Realpath (not just resolve) so a root
// reached through a symlink — pnpm layouts, linked workspaces — shares one
// context with its real directory instead of building a twin toolchain.
const canonicalRoots = new Map();
function canonicalRoot(projectRoot) {
  const hit = canonicalRoots.get(projectRoot);
  if (hit) return hit;
  let root;
  try {
    root = fs.realpathSync(projectRoot);
  } catch {
    root = path.resolve(projectRoot);
  }
  canonicalRoots.set(projectRoot, root);
  return root;
}

/** Any already-built context — for parse-only helpers with no root of their own. */
function anyContext() {
  for (const ctx of contexts.values()) return ctx;
  return null;
}
// 4: Flow enums are now transformed ahead of the preset's strip-types pass, so cached
// output from 3 is missing every `export enum` declaration. Neither the preset nor
// Babel version changed, and those are the only other inputs to the directory name, so
// without this bump a warm cache would keep serving the broken modules.
export const TRANSFORM_CACHE_VERSION = 4;

/**
 * Root directory for vitest-native's on-disk caches. Prefers the project's
 * node_modules/.cache — persistent across runs, per-project, and restorable by
 * standard CI dependency-cache actions (unlike os.tmpdir(), which is ephemeral
 * on CI runners and periodically purged on macOS). Falls back to tmpdir when
 * node_modules is absent or unwritable.
 */
export function cacheRootFor(projectRoot) {
  // The project's own node_modules, else the nearest one above it that holds React
  // Native: a project in a monorepo, or a Vitest project rooted in a subdirectory,
  // often has none of its own — its dependencies are hoisted — and its cache belongs
  // with the install it uses, not with an unrelated node_modules further up.
  const start = path.resolve(projectRoot);
  for (let dir = start; ; dir = path.dirname(dir)) {
    const nm = path.join(dir, "node_modules");
    const owns =
      dir === start
        ? fs.existsSync(nm)
        : fs.existsSync(path.join(nm, "react-native", "package.json"));
    if (owns) {
      try {
        const cache = path.join(nm, ".cache", "vitest-native");
        fs.mkdirSync(cache, { recursive: true });
        return cache;
      } catch {
        // Read-only node_modules (some CI sandboxes) — fall through to tmpdir.
      }
      break;
    }
    if (path.dirname(dir) === dir) break;
  }
  const dir = path.join(os.tmpdir(), "vitest-native-cache");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ctxFor(projectRoot) {
  const root = canonicalRoot(projectRoot);
  const existing = contexts.get(root);
  if (existing) return existing;
  const req = createRequire(path.join(root, "package.json"));
  let preset;
  let flowEnums;
  let exportNamespaceFrom = null;
  let presetVersion;
  let babelVersion;
  const transformPreset = resolveTransformPreset(root);
  const requiresBabel = () =>
    new VitestNativeError(
      "ENGINE_REQUIRES_BABEL",
      "engine 'native' requires a React Native Babel preset and '@babel/core' in " +
        "your project: '@react-native/babel-preset', or in an Expo project from SDK 56 " +
        "Expo's own (expo/internal/babel-preset). Install them as devDependencies " +
        "(they ship with React Native and Expo projects by default).",
    );
  if (transformPreset === null) throw requiresBabel();
  try {
    // Resolve-only here (cheap); the actual require of @babel/core happens
    // lazily on the first cache miss.
    preset = transformPreset.file;
    req.resolve("@babel/core");
    // Flow enums must be transformed BEFORE @babel/plugin-transform-flow-strip-types
    // sees them, or the declaration is removed as if it were a type annotation. The
    // React Native preset carries both, but in separate `overrides` entries that Babel
    // merges into ONE pass with strip-types first — so `export enum Foo {}` is deleted
    // while the code referencing Foo survives, leaving a module that throws
    // ReferenceError on a path nothing warned about. Measured identical on preset
    // 0.85.3 and 0.86.1, so this is the preset's ordering rather than version skew.
    //
    // Babel applies `plugins` before `presets`, so naming the plugin here runs it first
    // and the enum survives. Resolved from the preset, which depends on it (both
    // babel-preset-expo and the React Native preset do), so no new dependency is
    // required.
    try {
      flowEnums = createRequire(path.join(transformPreset.packageDir, "package.json")).resolve(
        "babel-plugin-transform-flow-enums",
      );
    } catch {
      // A preset layout without it: fall back to the preset's own handling rather than
      // failing the run. Flow enums are rare and only two React Native files use them.
      flowEnums = null;
    }
    // `export * as ns from '…'` (ES2020). Babel's CommonJS transform, which the React
    // Native preset runs, rejects it unless this plugin rewrites it first — so bare
    // React Native's Metro rejects it too, while Expo's Metro accepts it because
    // babel-preset-expo carries the plugin. Applied when the project's toolchain has it,
    // so app source required through Node (`jest.requireActual`, `require('#/…')`)
    // compiles exactly where the project's own bundler would.
    try {
      exportNamespaceFrom = req.resolve("@babel/plugin-transform-export-namespace-from");
    } catch {
      exportNamespaceFrom = null;
    }
    // The preset's name joins its version: the two presets' versions overlap.
    presetVersion = `${transformPreset.name.replace("/", "+")}@${transformPreset.version}`;
    babelVersion = req("@babel/core/package.json").version;
  } catch {
    throw requiresBabel();
  }
  // Both transformer versions key the directory — a preset or Babel upgrade
  // must never serve output produced by the previous version — and so does the
  // Babel environment: the preset's dev-mode JSX transform produces different
  // output (e.g. _jsxFileName injection) under NODE_ENV=development than under
  // test/production.
  const babelEnv = process.env.BABEL_ENV || process.env.NODE_ENV || "none";
  const cacheDir = path.join(
    cacheRootFor(root),
    // The optional plugin changes output, so its presence keys the directory too.
    `transform-${presetVersion}-b${babelVersion}-${babelEnv}-v${TRANSFORM_CACHE_VERSION}${exportNamespaceFrom ? "-ns" : ""}`,
  );
  fs.mkdirSync(cacheDir, { recursive: true });
  const ctx = {
    root,
    // The React Native preset takes engine options babel-preset-expo does not.
    presetOptions:
      transformPreset.name === "@react-native/babel-preset"
        ? { disableStaticViewConfigsCodegen: true }
        : {},
    // Whether the project resolves Expo, which selects jest-expo's Babel caller.
    hasExpo: resolvable(req, "expo/package.json"),
    configHashes: new Map(),
    req,
    preset,
    flowEnums,
    exportNamespaceFrom,
    cacheDir,
    babel: null,
    mem: new Map(),
    writeSeq: 0,
  };
  contexts.set(root, ctx);
  return ctx;
}

// App source Node loads (require(), jest.requireActual, what those load) compiles as
// babel-jest compiles it under Jest: @babel/core's loadPartialConfig decides, per file,
// which configuration applies (babel.config.* in any of Babel's formats, .babelrc*,
// package.json#babel, `only`/`ignore`, `overrides`, env- and caller-dependent function
// configs), and the file compiles with the options it returns (babel-jest 29.7,
// build/index.js:166-170 and 266-276). Macros and module-resolver aliases in the
// project's config would otherwise be missing. Packages keep the React Native preset,
// as does app source in a project with no Babel config of its own.
const NODE_MODULES = /[\\/]node_modules[\\/]/;

/** The caller babel-jest passes (build/index.js:196-237), or jest-expo's for Expo. */
function babelJestCaller(ctx, platform) {
  const flags = {
    // Jest's defaults for a CommonJS module without --experimental-vm-modules
    // (jest-runtime 29.7, build/index.js:173-179).
    supportsDynamicImport: false,
    supportsExportNamespaceFrom: false,
    supportsStaticESM: false,
    supportsTopLevelAwait: false,
  };
  // jest-expo's platform presets configure babel-jest with a Metro caller carrying the
  // platform (jest-expo 57, config/getPlatformPreset.js:48-66), which babel-preset-expo
  // reads to inline Platform.OS and process.env.EXPO_OS (build/common.js, getPlatform).
  // The engine runs one platform, so a project with Expo gets that preset's caller.
  if (ctx.hasExpo) return { name: "metro", bundler: "metro", platform, ...flags };
  return { name: "babel-jest", ...flags };
}

/**
 * The project's Babel options for `file`, or null when the React Native preset applies.
 * Called once per file version and platform: transformRN's in-memory cache answers
 * repeats. Measured on bluesky-social/social-app's Expo config: about 0.1 ms per file
 * (p95 0.3 ms), after a first call that loads the config's presets and plugins.
 */
function projectBabelOptions(ctx, file, platform) {
  if (!file.startsWith(ctx.root + path.sep) || NODE_MODULES.test(file)) return null;
  let partial;
  try {
    partial = callToolchain({
      kind: "config",
      root: ctx.root,
      file,
      caller: babelJestCaller(ctx, platform),
    });
  } catch (err) {
    throw transformFailure(err, file, platform);
  }
  if (partial.kind === "ignored") {
    // babel-jest's assertLoadedBabelConfig (build/index.js:103-113): compiling the file
    // without the configuration that excludes it would run code the project never
    // compiles that way.
    throw new VitestNativeError(
      "BABEL_IGNORES_FILE",
      `Babel ignores ${path.relative(ctx.root, file).split(path.sep).join("/")}: the ` +
        `project's Babel config excludes it through \`ignore\` or \`only\`, so it cannot ` +
        `be compiled for Node's require(). babel-jest fails the same way under Jest. ` +
        `Remove it from the config's \`ignore\`, or add it to \`only\`.`,
    );
  }
  if (partial.kind === "none") return null;
  return {
    // babel-jest keys its cache on the loaded options (getCacheKeyFromConfig,
    // build/index.js:135-165): a function config's output can depend on the
    // environment or the caller, which no file's bytes show. The config files' own
    // bytes join it, so an edit to an inline plugin is picked up as well.
    key: [
      partial.options,
      configFileHash(ctx, partial.config),
      configFileHash(ctx, partial.babelrc),
    ].join("\0"),
  };
}

function resolvable(req, request) {
  try {
    req.resolve(request);
    return true;
  } catch {
    return false;
  }
}

function configFileHash(ctx, file) {
  if (!file) return "";
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return "";
  }
  const memo = `${file}\0${st.mtimeMs}\0${st.size}`;
  let hash = ctx.configHashes.get(memo);
  if (hash === undefined) {
    hash = crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
    ctx.configHashes.set(memo, hash);
  }
  return hash;
}

/** A project's transform disk-cache directory, once resolved. Test hook. */
export function transformCacheDir(projectRoot) {
  return contexts.get(canonicalRoot(projectRoot))?.cacheDir ?? null;
}

/** Returns true if the source contains RN Flow syntax that must be transformed. */
/** A valid identifier, so a name can appear in the shorthand export hint. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Named exports of already-transformed CommonJS code, read from its AST.
 *
 * Node decides a CommonJS module's named exports with cjs-module-lexer, which reads
 * the source statically and stops at shapes it cannot follow. `module.exports = {
 * A() {}, b: () => 1 }` — ordinary hand-written CommonJS, and common across the React
 * Native ecosystem — yields `["A", "default", "module.exports"]`: `b` is missing, and
 * a name that is not an export appears. That is plain Node behaviour, reproducible
 * with no plugin involved.
 *
 * Reading it properly is possible here because the input is the transform's own
 * output rather than arbitrary source. Names are used only to emit a dead `0 && (module.exports = {…})`
 * hint, which is the form the lexer does understand.
 *
 * Returns an empty array when the shape is not statically knowable (`module.exports =
 * someValue`), which leaves Node's own detection in charge — no worse than before.
 */
export function cjsExportNames(code) {
  // Parse-only, so any project's @babel/core serves: the input is this module's
  // own transformed output, and parsing is toolchain-neutral across the versions
  // in play. Callers have no project root of their own to hand over.
  //
  // On this thread, unlike compiling (see "Where Babel runs"): it runs on warm runs
  // too, for every compiled module an import reaches, and a thread started for it
  // would be paid where no file needs compiling. Parsing loads @babel/core and its
  // parser, not the modules a transform loads lazily, and anything a test global's
  // getter needs compiled while they load is compiled on Babel's own thread.
  const ctx = anyContext();
  if (!ctx) return [];
  if (!ctx.babel) ctx.babel = ctx.req("@babel/core");
  let ast;
  try {
    ast = ctx.babel.parseSync(code, { babelrc: false, configFile: false, sourceType: "script" });
  } catch {
    return [];
  }
  const names = new Set();
  const isExportsTarget = (node, wantMember) => {
    if (!node) return false;
    if (node.type === "Identifier") return !wantMember && node.name === "exports";
    if (node.type !== "MemberExpression" || node.computed) return false;
    return (
      node.object.type === "Identifier" &&
      node.object.name === "module" &&
      node.property.type === "Identifier" &&
      node.property.name === "exports"
    );
  };
  for (const statement of ast.program.body) {
    if (statement.type !== "ExpressionStatement") continue;
    const expression = statement.expression;
    if (expression.type !== "AssignmentExpression" || expression.operator !== "=") continue;
    const target = expression.left;
    // `module.exports = { … }` / `exports = { … }` — take the literal's own keys.
    if (isExportsTarget(target, true) || isExportsTarget(target, false)) {
      if (expression.right.type !== "ObjectExpression") continue;
      for (const property of expression.right.properties) {
        if (property.type === "SpreadElement" || property.computed) continue;
        const key = property.key;
        if (key.type === "Identifier") names.add(key.name);
        else if (key.type === "StringLiteral" && IDENTIFIER.test(key.value)) names.add(key.value);
      }
      continue;
    }
    // `exports.foo = …` / `module.exports.foo = …` — the lexer handles these, but
    // a module can mix both forms and the object-literal branch would miss them.
    if (target.type === "MemberExpression" && !target.computed) {
      const owner = target.object;
      if (
        (owner.type === "Identifier" && owner.name === "exports") ||
        isExportsTarget(owner, true)
      ) {
        if (target.property.type === "Identifier") names.add(target.property.name);
      }
    }
  }
  names.delete("default");
  names.delete("__esModule");
  return [...names].filter((name) => IDENTIFIER.test(name));
}

export function isFlow(src) {
  return /@flow|import typeof|\bcomponent\s+\w/.test(src);
}

/**
 * Does this file need compiling, or can Node run it as published?
 *
 * The engine used to answer this by NAME: a package was compiled because detection or
 * a closure walk selected it. That guess was wrong far more often than it was right,
 * and every way of being wrong looked the same — a parse error deep inside a package
 * the project never mentioned. `@babel/runtime`, Metro's `lru-cache` chain and a
 * pure-ESM validator all arrived that way, and each was answered with another name to
 * exclude.
 *
 * The file itself answers precisely. If V8 can parse it, Node can run it, so compiling
 * is optional; if V8 cannot, Node cannot, so compiling is required. That is not a
 * heuristic — it is the same question Node is about to ask.
 *
 * Measured on a 41 KB file: the check costs 0.02 ms against 91 ms for the transform it
 * avoids. That is NOT a speed win in practice and should not be sold as one — on this
 * repository's own native suite, cold cache, it measured 7.68 s against 7.35 s without
 * the check, because React Native's own sources need compiling either way (440 of 450
 * fail to parse) and the check adds a parse to each. The win is that a package Node can
 * already run is never handed to Babel, whatever selected it.
 *
 * What is lost by skipping is downleveling for Hermes — `const` to `var`, destructuring
 * lowered. Verified against React Native's own sources and the installed ecosystem:
 * that is all the preset does to a file V8 accepts. It is behaviour-preserving on
 * Node, and if anything closer to what the package published. `__DEV__` is left
 * standing and top-level requires are not inlined, so neither observable transform
 * applies here.
 *
 * SCRIPT GOAL ONLY. A `type: module` package is still compiled as before: the loader
 * hands those to Node as CommonJS today, and changing that is an interop question
 * about named exports and live bindings that this check does not answer.
 */
const TYPESCRIPT_FILE = /\.[cm]?tsx?$/;

export function needsTransform(file, src) {
  if (file.endsWith(".mjs") || moduleGoal(file)) return true; // Not this check's business.
  // Node refuses TypeScript under node_modules by extension, whatever the content
  // ("Stripping types is currently unsupported for files under node_modules"). Expo
  // packages publish their TypeScript source (expo-modules-core's `main` is
  // src/index.ts), and a file with no type syntax — its src/polyfill/index.ts is a
  // bare `// noop` — parses as a script, so the check below would hand it to Node.
  if (TYPESCRIPT_FILE.test(file)) return true;
  try {
    // Parsed for the verdict only; the compiled script is never run.
    const parsed = new vm.Script(src, { filename: file });
    return parsed === undefined;
  } catch {
    return true;
  }
}

/** Is this file's nearest package.json `type: module`? Cached per directory. */
const goalCache = new Map();
function moduleGoal(file) {
  if (file.endsWith(".cjs")) return false;
  let dir = path.dirname(file);
  const seen = [];
  for (;;) {
    const cached = goalCache.get(dir);
    if (cached !== undefined) {
      for (const d of seen) goalCache.set(d, cached);
      return cached;
    }
    seen.push(dir);
    let verdict;
    try {
      verdict =
        JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).type === "module";
    } catch {
      verdict = undefined;
    }
    if (verdict !== undefined) {
      for (const d of seen) goalCache.set(d, verdict);
      return verdict;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      for (const d of seen) goalCache.set(d, false);
      return false;
    }
    dir = parent;
  }
}

// Where Babel runs.
//
// Babel compiles on a worker thread of its own (babel-worker.mjs), never on the thread
// that runs the tests, for the reason Jest's transformer is safe: under Jest, test code
// runs in a vm context, so whatever it installs on its globals never reaches Babel.
// Here test code and the engine share one realm, and Babel loads its own modules
// lazily, part of them during its first transform: @babel/traverse, @babel/generator
// and its source-map codec, and the preset's plugins. Those modules read globals as they
// initialise (@jridgewell/sourcemap-codec reads `TextDecoder`), and by then the realm
// holds what the tests installed. Any getter there whose first read requires a file the
// engine compiles is enough. Expo SDK 57's runtime, installed at setup as jest-expo does,
// is one: it replaces `TextDecoder` with a getter that requires
// expo/src/winter/TextDecoder.ts (SDK 58 no longer replaces `TextDecoder`). On a warm
// cache Babel first loads at the first miss, after that runtime, so the getter ran
// inside Babel's own loading, its require came back to the engine's hook, and the file
// was compiled by the half-loaded Babel: helper-replace-supers read `visitors`
// from a @babel/traverse still loading, and the run failed with "Cannot read
// properties of undefined (reading 'environmentVisitor')", blamed on whichever file
// had missed the cache. It happens only when the getter is still pending when Babel
// first loads, so it came and went with the state of the cache.
//
// On its own thread Babel sees Node's globals, whatever the test files install, and
// loads its presets and plugins as published, as under Jest, whose transformer is never
// transformed. That used to need a guard here: Babel's requires passed through the
// engine's CommonJS hook, which skipped compiling while a transform was running (#296)
// and so could not tell Babel's own requires from a test global's.
//
// The registry compiler's child process runs no test code, so Babel runs there on its
// one thread (compileOnThisThread). A thread that dies never leaves its caller waiting:
// one that exits or throws says so at once, and a deadline catches one V8 stopped for
// running out of heap (TOOLCHAIN_DEADLINE_MS).
//
// Rejected:
// - Loading Babel and the preset before Expo's runtime (or anything else) is
//   installed: about 130 ms (require 30 ms, first transform 100 ms, measured on an
//   Expo app) in every isolated worker, on every run, warm or not. And it only
//   covers what is installed after the engine's setup.
// - Refusing a nested transform (a counter, failing with a clear message): the
//   require inside the getter is synchronous and cannot wait, so the failure only gets
//   a better name and the run still fails.
// - Reading `TextDecoder` and the like from Node for the toolchain: it would mean
//   patching what Babel's dependencies read, one global at a time.
//
// The thread costs about 15 ms to start, once per thread and only at the first miss
// or project-config lookup, and about 0.02 ms per request. A warm run starts none.
// The thread shares process.env (SHARE_ENV), so a configuration reading the
// environment sees what it saw before. It is started with no execArgv: nothing of the
// engine (hooks, conditions, loaders) loads there.
const BABEL_WORKER = new URL("./babel-worker.mjs", import.meta.url);

/**
 * How long a request may go unanswered before Babel's thread is presumed lost and
 * stopped. A thread that ends normally, or throws, says so at once (babel-worker.mjs);
 * one V8 stops for running out of heap runs no handler, and only this ends the wait.
 * The slowest single transform measured is well under a second.
 */
const TOOLCHAIN_DEADLINE_MS = 60_000;

// Captured as this module loads: the call below runs while test code is on the stack,
// and a test that stubs one of these (or fakes the clock) must not stop compiling.
const atomicsLoad = Atomics.load;
const atomicsStore = Atomics.store;
const atomicsWait = Atomics.wait;
const SharedArrayBufferCtor = SharedArrayBuffer;
const Int32ArrayCtor = Int32Array;
const now = performance.now.bind(performance);

// signal[0]: 0 while a request is outstanding, 1 answered, 2 the thread ended.
// signal[1]: 1 once the thread has ended.
let toolchain = null;
// Internal: the deadline, the worker file and its resource limits, for tests that end a
// thread on purpose (_setToolchainOptions).
let toolchainOptions = {};
// The registry compiler's child process runs no test code, so Babel runs there on the
// one thread, as before: that process's heap bound and its out-of-memory retry
// (bounded-process.mjs) apply to Babel too.
let onThisThread = false;

/** Run Babel on this thread: for a process that runs no test code (registry-compiler.mjs). */
export function compileOnThisThread() {
  onThisThread = true;
}

/** Internal test seam: `{ deadlineMs, workerUrl, resourceLimits }`; stops the current thread. */
export function _setToolchainOptions(options = {}) {
  toolchain?.worker.terminate();
  toolchain = null;
  toolchainOptions = options;
}

// Sized explicitly. Left to its default, a worker started in a process whose old space
// is capped small collects its young generation so often that compiling React Native's
// 412 files takes about twice the CPU: 7.8-9.7 s against 3.6-6.1 s with this setting,
// at --max-old-space-size=96 and 128. At 256 MB, 1024 MB and uncapped the two measured
// the same. The engine's own capped process (the registry compiler) no longer starts
// this thread, but a test process run with a small heap cap still would. The old space
// keeps the process's cap.
const YOUNG_GENERATION = { maxYoungGenerationSizeMb: 32 };

function startToolchain() {
  const { port1, port2 } = new MessageChannel();
  const signal = new Int32ArrayCtor(new SharedArrayBufferCtor(8));
  const worker = new Worker(toolchainOptions.workerUrl ?? BABEL_WORKER, {
    // Node's compile cache as the calling thread has it (compile-cache.mjs decides per
    // thread, and leaves it off where it would only grow), so Babel loads from it too.
    workerData: { port: port2, signal, compileCache: nodeModule.getCompileCacheDir?.() },
    transferList: [port2],
    execArgv: [],
    env: SHARE_ENV,
    // The hot runtime's heap-based recycling (hotRuntime.memoryLimit) reads the test
    // worker's own heap, which no longer holds Babel: this thread's heap is its own
    // isolate's and is not counted. Babel's heap is bounded by what it compiles, and the
    // thread ends with the test worker that started it.
    resourceLimits: { ...YOUNG_GENERATION, ...toolchainOptions.resourceLimits },
  });
  // The caller already failed the transform when it was not answered; this is the
  // thread's own account (out of memory, a throw while loading), printed beside it
  // rather than left as an unhandled error event in the test worker.
  worker.on("error", (err) => {
    process.stderr.write(`[vitest-native] Babel's thread: ${err?.stack ?? err}\n`);
  });
  // Neither keeps the test thread alive: answers are read synchronously.
  worker.unref();
  port1.unref();
  return { port: port1, signal, worker };
}

const ERROR_TYPES = { SyntaxError, TypeError, RangeError, ReferenceError };

/** Babel's thread is gone: its own failure, not the file's. transformRN names the file. */
function toolchainLost(detail) {
  const err = new VitestNativeError("TRANSFORM_FAILED", detail);
  Object.defineProperty(err, "toolchainLost", { value: detail });
  return err;
}

/** One request to Babel, answered synchronously. */
function callToolchain(request) {
  if (onThisThread) return handleToolchainRequest(request);
  if (toolchain === null || atomicsLoad(toolchain.signal, 1) === 1) toolchain = startToolchain();
  const { port, signal, worker } = toolchain;
  const deadlineMs = toolchainOptions.deadlineMs ?? TOOLCHAIN_DEADLINE_MS;
  atomicsStore(signal, 0, 0);
  port.postMessage(request);
  const deadline = now() + deadlineMs;
  for (;;) {
    const left = deadline - now();
    if (left <= 0) break;
    if (atomicsWait(signal, 0, 0, Math.min(left, 1000)) !== "timed-out") break;
    if (atomicsLoad(signal, 1) === 1) break;
  }
  const reply = receiveMessageOnPort(port)?.message;
  if (reply === undefined) {
    const ended = atomicsLoad(signal, 1) === 1;
    toolchain = null;
    if (!ended) {
      worker.terminate();
      throw toolchainLost(
        `Babel's thread has not answered in ${Math.round(deadlineMs / 1000)} s and was ` +
          `stopped. It may have run out of memory: V8 stops a thread that runs out of ` +
          `heap without running its exit handlers. If so, give Node more heap ` +
          `(--max-old-space-size).`,
      );
    }
    throw toolchainLost(
      "Babel's thread ended before it answered: something it ran ended it (a " +
        "`process.exit()` in a Babel config, preset or plugin), or it crashed. Its own " +
        'error, if it has one, is printed as "Babel\'s thread:".',
    );
  }
  if (reply.error) {
    const { name, message, code, stack } = reply.error;
    const err = new (ERROR_TYPES[name] ?? Error)(message);
    err.name = name;
    if (code !== undefined) err.code = code;
    if (stack) err.stack = stack;
    throw err;
  }
  return reply.ok;
}

/** A transform failure, named for the file: Babel's own, or its thread's. */
function transformFailure(err, file, platform) {
  if (err?.toolchainLost) {
    return new VitestNativeError(
      "TRANSFORM_FAILED",
      `Could not transform ${file} for platform '${platform}'. ${err.toolchainLost}`,
      { cause: err },
    );
  }
  return decorateTransformError(err, file, platform);
}

/** Transform an RN source file to runnable CJS. Cached in-memory + on disk. */

/**
 * The compiled output transformRN already holds for `file` as it is on disk now
 * (same size and mtime), or undefined. For a caller that must read the source to
 * decide whether to compile at all (isFlow, needsTransform): a file it compiled before
 * is answered without that read.
 */
export function heldTransform(file, projectRoot, platform = "ios") {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return undefined;
  }
  return ctxFor(projectRoot).mem.get(`${platform}\0${file}\0${st.mtimeMs}\0${st.size}`);
}

export function transformRN(file, src, projectRoot, platform = "ios") {
  const ctx = ctxFor(projectRoot);
  // The in-memory key uses mtime+size (one statSync) so the hot path skips
  // hashing; the DISK key hashes the actual content, so entries stay valid
  // across fresh installs, Docker mtime normalization, and CI cache restores —
  // and a same-path file with different content can never produce a wrong hit.
  // The FILENAME is part of the key because Babel's output depends on it: the
  // preset embeds the absolute path (_jsxFileName) in transformed JSX, so two
  // identical sources at different paths must not share an entry.
  const st = fs.statSync(file);
  const memKey = `${platform}\0${file}\0${st.mtimeMs}\0${st.size}`;
  const memHit = ctx.mem.get(memKey);
  if (memHit !== undefined) return memHit;
  // A caller that has not read the file yet passes no source, and pays for the read
  // only here, on a miss. The hot runtime re-loads a library a test file used on every
  // file, so its sources would otherwise be read again each time just to find this hit.
  if (src === undefined) src = fs.readFileSync(file, "utf8");

  // App source under a project Babel config compiles with it (projectBabelOptions),
  // and the options it loaded key the output.
  const projectConfig = projectBabelOptions(ctx, file, platform);
  const hash = crypto
    .createHash("sha1")
    .update(platform)
    .update("\0")
    .update(file)
    .update("\0")
    .update(src);
  if (projectConfig) hash.update("\0babel-config\0").update(projectConfig.key);
  const key = hash.digest("hex");
  const cachePath = path.join(ctx.cacheDir, key + ".js");
  try {
    const cached = fs.readFileSync(cachePath, "utf8");
    ctx.mem.set(memKey, cached);
    return cached;
  } catch {}

  let out;
  try {
    out = callToolchain(
      projectConfig
        ? {
            kind: "transform",
            root: ctx.root,
            file,
            src,
            project: true,
            caller: babelJestCaller(ctx, platform),
          }
        : {
            kind: "transform",
            root: ctx.root,
            src,
            options: {
              filename: file,
              plugins: [ctx.flowEnums, ctx.exportNamespaceFrom].filter(Boolean),
              // A fresh options object each call, as before Expo's preset was supported:
              // Babel caches a preset's result per options object, so sharing one would
              // change when the preset is instantiated.
              presets: [[ctx.preset, { ...ctx.presetOptions }]],
              babelrc: false,
              configFile: false,
              caller: { name: "metro", bundler: "metro", platform, supportsStaticESM: false },
            },
          },
    ).code;
  } catch (err) {
    // Decorate here, at the single choke point, so every caller — the ESM
    // loader, the CJS require hook, requireActual's .ts handlers — surfaces
    // the file, platform, and owning package instead of a bare Babel stack.
    throw transformFailure(err, file, platform);
  }
  // Atomic write: multiple worker threads may transform the same RN file
  // concurrently on a cold cache. Write to a unique temp file then rename
  // (atomic on POSIX same-dir) so a concurrent reader never sees a partial file.
  const tmp = `${cachePath}.${process.pid}.${ctx.writeSeq++}.tmp`;
  try {
    fs.writeFileSync(tmp, out);
    fs.renameSync(tmp, cachePath);
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
  }
  ctx.mem.set(memKey, out);
  return out;
}
