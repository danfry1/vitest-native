// Flow-strips a React Native source file via the project's @react-native/babel-preset
// (the only transformer that lowers RN's `component` syntax). Used by BOTH the loader
// hook (import) and the require hook, which run in separate threads: each gets its own
// instance of this module, so the in-memory `mem` cache below is per-thread (no shared
// mutable state to race on). The disk cache — keyed by CONTENT hash + platform, in a
// directory versioned by preset + @babel/core versions — is the layer shared across
// threads, workers, runs, and (because content-keyed entries survive fresh installs
// and mtime normalization) CI cache restores. The path is part of the key too —
// Babel output embeds the filename — so restores are valid wherever the checkout
// path is stable (CI runners use a fixed workspace path).
//
// @babel/core itself is loaded lazily, only on a cache MISS: on a warm cache the
// default engine pays this module's init in every isolated worker, and requiring
// Babel costs ~35ms vs ~0.5ms for resolving versions — pure waste when every file
// is served from disk.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import vm from "node:vm";
import { decorateTransformError } from "./explain.mjs";
import { VitestNativeError } from "../errors.mjs";

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
  const nm = path.join(projectRoot, "node_modules");
  if (fs.existsSync(nm)) {
    try {
      const dir = path.join(nm, ".cache", "vitest-native");
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      // Read-only node_modules (some CI sandboxes) — fall through to tmpdir.
    }
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
  let presetVersion;
  let babelVersion;
  try {
    // Resolve-only here (cheap); the actual require of @babel/core happens
    // lazily on the first cache miss.
    preset = req.resolve("@react-native/babel-preset");
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
    // and the enum survives. Resolved from the preset, which depends on it, so no new
    // dependency is required.
    try {
      flowEnums = createRequire(req.resolve("@react-native/babel-preset/package.json")).resolve(
        "babel-plugin-transform-flow-enums",
      );
    } catch {
      // A preset layout without it: fall back to the preset's own handling rather than
      // failing the run. Flow enums are rare and only two React Native files use them.
      flowEnums = null;
    }
    presetVersion = req("@react-native/babel-preset/package.json").version;
    babelVersion = req("@babel/core/package.json").version;
  } catch {
    throw new VitestNativeError(
      "ENGINE_REQUIRES_BABEL",
      "engine 'native' requires '@react-native/babel-preset' and " +
        "'@babel/core' in your project. Install them as devDependencies " +
        "(they ship with React Native projects by default).",
    );
  }
  // Both transformer versions key the directory — a preset or Babel upgrade
  // must never serve output produced by the previous version — and so does the
  // Babel environment: the preset's dev-mode JSX transform produces different
  // output (e.g. _jsxFileName injection) under NODE_ENV=development than under
  // test/production.
  const babelEnv = process.env.BABEL_ENV || process.env.NODE_ENV || "none";
  const cacheDir = path.join(
    cacheRootFor(root),
    `transform-${presetVersion}-b${babelVersion}-${babelEnv}-v${TRANSFORM_CACHE_VERSION}`,
  );
  fs.mkdirSync(cacheDir, { recursive: true });
  const ctx = { req, preset, flowEnums, cacheDir, babel: null, mem: new Map(), writeSeq: 0 };
  contexts.set(root, ctx);
  return ctx;
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
 * Reading it properly is possible here because Babel is already loaded to do the
 * transform, and because the input is the transform's own output rather than
 * arbitrary source. Names are used only to emit a dead `0 && (module.exports = {…})`
 * hint, which is the form the lexer does understand.
 *
 * Returns an empty array when the shape is not statically knowable (`module.exports =
 * someValue`), which leaves Node's own detection in charge — no worse than before.
 */
export function cjsExportNames(code) {
  // Parse-only, so any project's @babel/core serves: the input is this module's
  // own transformed output, and parsing is toolchain-neutral across the versions
  // in play. Callers have no project root of their own to hand over.
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
export function needsTransform(file, src) {
  if (file.endsWith(".mjs") || moduleGoal(file)) return true; // Not this check's business.
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

/** Transform an RN source file to runnable CJS. Cached in-memory + on disk. */
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

  const key = crypto
    .createHash("sha1")
    .update(platform)
    .update("\0")
    .update(file)
    .update("\0")
    .update(src)
    .digest("hex");
  const cachePath = path.join(ctx.cacheDir, key + ".js");
  try {
    const cached = fs.readFileSync(cachePath, "utf8");
    ctx.mem.set(memKey, cached);
    return cached;
  } catch {}

  if (!ctx.babel) ctx.babel = ctx.req("@babel/core");
  let out;
  try {
    out = ctx.babel.transformSync(src, {
      filename: file,
      plugins: ctx.flowEnums ? [ctx.flowEnums] : [],
      presets: [[ctx.preset, { disableStaticViewConfigsCodegen: true }]],
      babelrc: false,
      configFile: false,
      caller: { name: "metro", bundler: "metro", platform, supportsStaticESM: false },
    }).code;
  } catch (err) {
    // Decorate here, at the single choke point, so every caller — the ESM
    // loader, the CJS require hook, requireActual's .ts handlers — surfaces
    // the file, platform, and owning package instead of a bare Babel stack.
    throw decorateTransformError(err, file, platform);
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
