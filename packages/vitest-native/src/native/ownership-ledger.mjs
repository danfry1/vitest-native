/**
 * The ownership guard: a per-worker ledger of which module system evaluated each file.
 *
 * Under the native engine Node and Vite both evaluate modules in one worker. A file
 * evaluated by both exists twice, with two copies of its state, and nothing throws: a
 * store written through one copy reads back unset through the other. The policy in
 * ownership.mjs decides who SHOULD own a file. This records who actually evaluated it,
 * and reports the moment a file reaches the second side while the first copy is still
 * live. Design, routes, limits and rollout: docs/ownership-guard.md.
 *
 * Node side: wrappers on Module.prototype._compile (every CommonJS evaluation, and
 * require() of an ES module, from whichever hook compiled it) and on the `.json`
 * loader, plus true ESM from loader.mjs: called directly when the loader runs in this
 * thread, posted through a MessagePort when it runs on its own. Vite side: a call the
 * plugin puts at the top of every module it transforms (VITE_MARKER), so it runs
 * before the module's own body.
 *
 * A hit is checked for LIVENESS before anything is reported, which is what keeps
 * per-file resets correct without hooks of their own: the hot reset, jest.resetModules
 * and isolateModules all drop a copy, and a dropped copy cannot split state with the
 * next one. Node copies are held through WeakRefs, so the ledger never keeps a module
 * the cache has let go of alive.
 */
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MessageChannel, receiveMessageOnPort } from "node:worker_threads";
import { NODE_MODULES_PATH, containsPath } from "./match.mjs";
import {
  TEST_RUNTIME_RESIDENT_PATH,
  createNativeOwnershipPolicy,
  parseNativeOwnershipManifest,
} from "./ownership.mjs";
import { VitestNativeError } from "../errors.mjs";

/** Serialized guard config (mode + exemptions), set by the plugin for the worker. */
export const OWNERSHIP_GUARD_ENV = "VITEST_NATIVE_OWNERSHIP_GUARD";
/** Run-wide override of the mode, read by the plugin: `error` or `warn`. */
export const OWNERSHIP_MODE_ENV = "VITEST_NATIVE_OWNERSHIP_MODE";
/** The global the plugin's marker reaches. */
export const VITE_MARKER = "__vitest_native_ownership_vite";
/** Where a file's dual evaluations travel to the reporter (`testModule.meta()`). */
export const OWNERSHIP_META_KEY = "vitestNativeOwnership";
/** jest-compat raises this around its synchronous requireActual/requireMock loads. */
export const JEST_REQUIRE_DEPTH = Symbol.for("vitest-native.jest-require-depth");
const NODE_ESM_MARKER = "__vitest_native_ownership_node_esm";
const INSTALLED = Symbol.for("vitest-native.ownership-ledger");

/**
 * The engine's own runtime: this file's parent directory (`src/` in the repository,
 * `dist/` when installed). The hot worker imports it through Node before any test file
 * exists and the setup file reaches it through Vite; every install in it is guarded on
 * globalThis for that reason. Exempt by rule, with TEST_RUNTIME_RESIDENT_PATH for the
 * rest of the test stack (vitest, @vitest/*, chai).
 */
export const ENGINE_RUNTIME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * One spelling for a path, so both sides key a file identically: forward slashes and an
 * upper-case drive letter. Vite reports `D:/a/x.ts`, Node `D:\a\x.ts` (path-spelling
 * keys). Real-pathing is the caller's job (realKey).
 */
export function ledgerKey(file) {
  const forward = String(file).replace(/\\/g, "/");
  return /^[a-z]:\//.test(forward) ? forward[0].toUpperCase() + forward.slice(1) : forward;
}

/**
 * macOS and Windows file systems are case-insensitive by default: `require('./CaseStore')`
 * and `import './casestore'` are one file there, and each side keeps the case it was
 * asked for. Keys are folded to lower case on those platforms. Asking the OS for the
 * stored case (`realpathSync.native`) per Node compile measured about 10 µs per
 * require of a project file; folding costs nothing. The price is a case-SENSITIVE
 * volume on those platforms (rare) holding two files whose names differ only in case,
 * each evaluated by a different side: reported as one. On Linux keys are not folded.
 */
const FOLD_CASE = process.platform === "darwin" || process.platform === "win32";
const fold = FOLD_CASE ? (key) => key.toLowerCase() : (key) => key;

/** Node's filename as a ledger key: Node's filenames are already real paths. */
export function nodeKey(file) {
  return fold(ledgerKey(file));
}

/** A path as a ledger key, real-pathed first (Vite's ids, and --preserve-symlinks). */
export function realKey(file) {
  try {
    return fold(ledgerKey(fs.realpathSync(file)));
  } catch {
    return fold(ledgerKey(file));
  }
}

// Queries that make Vite serve something other than the file's code as a module.
const NOT_THE_MODULE = /[?&](?:raw|url|inline|worker|sharedworker)\b/;

/**
 * The call the plugin puts at the top of a module it hands Vite's runner, or null.
 * Query-suffixed ids (`./x.ts?v=1`) are the same file's code and are recorded under
 * the file; queries that serve something else (`?raw`, `?url`) are not.
 */
export function viteMarkerFor(id) {
  if (typeof id !== "string" || id.includes("\0") || NOT_THE_MODULE.test(id)) return null;
  const file = id.replace(/[?#].*$/, "");
  if (!path.isAbsolute(file) || !/\.(?:[cm]?[jt]sx?|json)$/.test(file)) return null;
  if (!fs.existsSync(file)) return null;
  return `globalThis.${VITE_MARKER}?.(${JSON.stringify(realKey(file))}, ${JSON.stringify(file)});`;
}

/**
 * Parse the guard config the plugin serialized. Untrusted (users can set `test.env`),
 * and a malformed value must not stop a run: it falls back to the default mode.
 */
export function parseOwnershipGuardConfig(raw) {
  const fallback = { mode: "warn", allow: [] };
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    const mode = value?.mode === "error" ? "error" : "warn";
    const allow = Array.isArray(value?.allow)
      ? value.allow.filter(
          (entry) =>
            entry &&
            typeof entry.path === "string" &&
            typeof entry.reason === "string" &&
            entry.reason.trim() !== "",
        )
      : [];
    return { mode, allow };
  } catch {
    return fallback;
  }
}

const ROUTES = {
  "jest-compat": {
    label: "a synchronous jest.requireActual/requireMock through jest-compat",
    fix:
      "Vite had not evaluated the file yet, so Node loaded its own copy. Import the " +
      "module statically before the jest.mock that needs it, or load it with " +
      "`await vi.importActual(...)` inside an async factory.",
  },
  "require-from-vite": {
    label: "require() in a file Vite evaluated",
    fix:
      "Vitest's `require` inside a test or source file is Node's. Use `import` (or " +
      "`await vi.importActual(...)`) so the file stays in Vite's graph.",
  },
  "node-owned-source": {
    label: "an import from source Node evaluated",
    fix:
      "Node-owned code reached a file Vite owns, typically a workspace package Node " +
      "owns whose source imports a sibling through a resolve.alias or tsconfig paths. " +
      "Keep both packages on one side.",
  },
  "installed-package": {
    label: "an installed package required it",
    fix:
      "A Node-owned package depends on a file Vite owns. Nothing can make that one " +
      "instance: import the file from one side only, or test it from a package that " +
      "does not sit underneath that dependency.",
  },
  "node-esm": {
    label: "Node's ESM loader imported it",
    fix:
      "An externalized module imported a file Vite also evaluates. Give the file one " +
      "owner: drop the server.deps.inline rule that claims it, or the alias that " +
      "sends Vite to it.",
  },
  "vite-inline": {
    label: "an installed file that Vite also evaluates",
    fix:
      "A server.deps.inline rule, Vitest's default inlining or an alias gave Vite a " +
      "file under node_modules that Node also loads. Remove the rule or alias that " +
      "gives it to Vite, so Node's copy is the only one.",
  },
};

const VIA = {
  cjs: "CommonJS",
  "require-esm": "require() of an ES module",
  esm: "ESM loader",
  json: "JSON",
};

const ENGINE_FRAME = ENGINE_RUNTIME_DIR + path.sep;

function frames(stack) {
  return String(stack ?? "")
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith("at ") &&
        !line.includes("node:") &&
        // The engine's own hooks and Vitest's runner: every stack has them, and they
        // push the caller's frame out of view.
        !line.includes(ENGINE_FRAME) &&
        !/[\\/](?:vitest|vite)[\\/]dist[\\/]/.test(line),
    )
    .slice(0, 8);
}

/**
 * The ledger. Pure apart from the liveness probes it is given, so tests drive it
 * directly; installOwnershipLedger wires it to Node and Vite.
 *
 * Node records are kept per MODULE, not per path: jest.isolateModules loads a second
 * Node copy and later restores the first, and a single slot per path would have lost
 * the restored one. Dead records are dropped whenever a path is recorded again.
 */
export function createOwnershipLedger({
  mode = "warn",
  allow = [],
  exemptDirs = [ENGINE_RUNTIME_DIR],
  nodeLive = () => true,
  collected = () => false,
  viteLive = () => true,
  viteImporter = () => null,
  ownerOf = () => null,
  warn = (message) => console.warn(message),
} = {}) {
  const node = new Map();
  const vite = new Map();
  const reported = new Set();
  const conflicts = [];
  const allowUsed = new Set();

  // Matched on the path as the evaluating side spelled it, not on the (case-folded) key.
  const exemption = (file) => {
    if (TEST_RUNTIME_RESIDENT_PATH.test(file)) return "the test runtime (vitest, chai)";
    if (exemptDirs.some((dir) => containsPath(dir, file))) return "the engine's own runtime";
    const hit = allow.find((entry) => containsPath(entry.path, file));
    if (!hit) return null;
    allowUsed.add(hit.path);
    return `ownership.allow: ${hit.reason}`;
  };

  const liveNode = (key) => node.get(key)?.find((record) => nodeLive(record));

  // How the Node copy came to exist: that is the actionable half, since the policy
  // usually gives the file to Vite.
  function routeOf(key, nodeEntry, owner) {
    // Vite evaluating a file Node owns, or any installed file, is an inline/alias
    // claim whichever side came first.
    if (owner?.owner === "node" || NODE_MODULES_PATH.test(key)) return "vite-inline";
    if (nodeEntry.via === "esm") return "node-esm";
    if (nodeEntry.jestRequire) return "jest-compat";
    const parent = nodeEntry.parent;
    if (typeof parent === "string" && NODE_MODULES_PATH.test(parent)) return "installed-package";
    if (typeof parent === "string" && node.has(nodeKey(parent))) return "node-owned-source";
    return "require-from-vite";
  }

  function report(key, nodeEntry, viteEntry, second, { deferred = false } = {}) {
    const owner = ownerOf(nodeEntry.filename);
    const route = routeOf(key, nodeEntry, owner);
    const { label, fix } = ROUTES[route];
    const ownerName = { node: "Node", vite: "Vite", "vitest-default": "none declared" };
    const ownerLine = owner
      ? `${ownerName[owner.owner] ?? owner.owner} (${owner.reason})`
      : "unknown";
    const parent = nodeEntry.parent ?? "(no parent recorded)";
    const importer = viteImporter(viteEntry) ?? "(no importer recorded)";
    const nodeLine = `Node (${VIA[nodeEntry.via] ?? nodeEntry.via}), required by ${parent}`;
    const viteLine = `Vite, imported by ${importer}`;
    // A stack only for the evaluation happening now, and only when there is something
    // to report: capturing one per compile cost more than the rest of the ledger.
    const stack = second === "node" && !deferred ? frames(new Error().stack) : [];
    let outcome;
    if (mode !== "error") {
      outcome =
        `  This is a warning today and an error from the next minor; set ` +
        `reactNative({ ownership: 'error' }) to fail now. `;
    } else if (deferred) {
      outcome =
        `  Node's ESM loader runs on its own thread here, so this was seen after both ` +
        `copies existed; the test file fails at its end (ownership: 'error'). `;
    } else if (second === "node") {
      outcome = `  Node's copy was never evaluated: the require threw (ownership: 'error'). `;
    } else {
      outcome = `  Vite's copy was refused before its body ran: the import threw (ownership: 'error'). `;
    }
    const message =
      `[vitest-native] ${nodeEntry.filename} was evaluated by both Node and Vite in this ` +
      `worker. It now exists twice, and module state written through one copy is not ` +
      `seen by the other.\n` +
      `  policy owner -> ${ownerLine}\n` +
      `  first        -> ${second === "vite" ? nodeLine : viteLine}\n` +
      `  second       -> ${second === "vite" ? viteLine : nodeLine}\n` +
      `  route        -> ${label}\n` +
      `  fix          -> ${fix}\n` +
      (stack.length > 0
        ? `  Node stack:\n${stack.map((line) => `    ${line}`).join("\n")}\n`
        : "") +
      outcome +
      `A deliberate case can be exempted with ownership.allow: [{ path, reason }] ` +
      `(docs/ownership-guard.md).`;
    conflicts.push(
      Object.freeze({
        code: "MODULE_DUAL_EVALUATION",
        file: nodeEntry.filename,
        first: second === "vite" ? "node" : "vite",
        second,
        route,
        via: nodeEntry.via,
        owner: owner?.owner ?? null,
        message,
      }),
    );
    if (mode === "error" && !deferred) {
      throw new VitestNativeError("MODULE_DUAL_EVALUATION", message);
    }
    if (reported.has(key)) return;
    reported.add(key);
    warn(message);
  }

  return {
    mode,
    conflicts,
    allowUsed,
    /**
     * Node is about to evaluate `filename`. Throws in error mode BEFORE the code runs,
     * so the second copy never exists. `deferred` is for records that arrive after the
     * fact (the threaded ESM loader): they are reported, never thrown.
     */
    recordNode(filename, entry, { key = nodeKey(filename), deferred = false } = {}) {
      entry.filename = filename;
      const prior = vite.get(key);
      if (prior && viteLive(prior) && !exemption(filename)) {
        report(key, entry, prior, "node", { deferred });
      }
      const records = node.get(key);
      if (records === undefined) node.set(key, [entry]);
      else {
        // Only records whose module is gone for good are dropped. A copy out of the
        // cache may come back: isolateModules restores the outer copy afterwards.
        const kept = records.filter((record) => !collected(record));
        kept.push(entry);
        node.set(key, kept);
      }
    },
    /** Vite is about to run the body of the module whose real-path key is `key`. */
    recordVite(key, file) {
      const entry = { file, key };
      const prior = liveNode(key);
      if (prior && !exemption(file)) report(key, prior, entry, "vite");
      vite.set(key, entry);
    },
  };
}

function preserveSymlinks() {
  return (
    process.execArgv.includes("--preserve-symlinks") || process.env.NODE_PRESERVE_SYMLINKS === "1"
  );
}

/**
 * Install the ledger in this worker, once. Called by the setup file (stock pools) and
 * by the hot worker at boot, before React Native preloads.
 */
export function installOwnershipLedger({ projectRoot = process.cwd() } = {}) {
  if (globalThis[INSTALLED]) return globalThis[INSTALLED];
  const config = parseOwnershipGuardConfig(process.env[OWNERSHIP_GUARD_ENV]);
  let policy;
  const ownerOf = (file) => {
    if (policy === undefined) {
      const manifest = parseNativeOwnershipManifest(process.env.VITEST_NATIVE_OWNERSHIP);
      policy = manifest
        ? createNativeOwnershipPolicy({
            projectRoot: manifest.projectRoot,
            projectDirs: manifest.projectDirs,
            reactNativeRoots: manifest.reactNativeRoots,
            runtimeTransforms: manifest.nodeTransformPackages,
          })
        : null;
    }
    return policy?.decideFile(file) ?? null;
  };
  const generation = () => {
    const view = globalThis.__vitest_native_hot_generation;
    return view ? Atomics.load(view, 0) : 0;
  };
  const graph = () => globalThis.__vitest_worker__?.evaluatedModules;
  // Vite's nodes for a file: by file, plus the `mock:` node vi.mock(path, { spy: true })
  // runs the original under (Vitest 5 keys it `mock:<id>`, outside the file index).
  const viteNodes = (file) => {
    const g = graph();
    const nodes = [...(g?.getModulesByFile?.(file) ?? [])];
    const spy = g?.idToModuleMap?.get?.(`mock:${file}`);
    if (spy) nodes.push(spy);
    return nodes;
  };
  const ledger = createOwnershipLedger({
    mode: config.mode,
    allow: config.allow.map((entry) => ({
      ...entry,
      path: path.resolve(projectRoot, entry.path),
    })),
    ownerOf,
    nodeLive: (record) => {
      if (record.via === "esm") {
        // Node's ESM registry has no eviction. Only a hot generation stamp makes the
        // next import a different instance (versionable in loader.mjs).
        return record.generation == null || record.generation === generation();
      }
      // The module is live while Node's cache still holds THAT module, under the key
      // Node used for it (the link path under --preserve-symlinks).
      const module = record.ref?.deref();
      return module !== undefined && Module._cache[record.cacheKey] === module;
    },
    collected: (record) => record.ref !== undefined && record.ref.deref() === undefined,
    viteLive: (entry) => {
      if (typeof graph()?.getModulesByFile !== "function") return true;
      return viteNodes(entry.file).some((n) => n.evaluated || n.promise);
    },
    viteImporter: (entry) => {
      for (const n of viteNodes(entry.file)) {
        const importer = n.importers?.values().next().value;
        if (importer) return importer;
      }
      return null;
    },
  });

  // Node's filenames are real paths, except under --preserve-symlinks, where Node keys
  // its cache by the link and the ledger has to real-path it to meet Vite's spelling.
  const keyOf = preserveSymlinks() ? realKey : nodeKey;
  const jestRequire = () => (globalThis[JEST_REQUIRE_DEPTH] ?? 0) > 0;
  const nodeRecord = (module, filename, via) => ({
    via,
    ref: new WeakRef(module),
    cacheKey: filename,
    // The requirer: the module that first loaded this one, kept as a string so the
    // record holds nothing alive. `module.parent` is a documentation-only deprecation
    // (DEP0144): no warning unless the run passes --pending-deprecation.
    parent: module.parent?.filename,
    jestRequire: jestRequire(),
  });

  const originalCompile = Module.prototype._compile;
  // Modules already recorded by an extension handler below, so `_compile` does not
  // record them a second time.
  const recording = new WeakSet();
  Module.prototype._compile = function (content, filename, format, ...rest) {
    if (typeof filename === "string" && !recording.has(this)) {
      ledger.recordNode(
        filename,
        nodeRecord(this, filename, format === "module" ? "require-esm" : "cjs"),
        { key: keyOf(filename) },
      );
    }
    return originalCompile.call(this, content, filename, format, ...rest);
  };
  // require() of an `.mjs` file. Node 24 routes it through `_compile` with format
  // "module" (above); Node 22.13 evaluates it without `_compile`, and the threaded
  // loader never sees a require, so the extension handler is where it shows. A second
  // record of one module is harmless: it is reported once.
  const originalMjs = Module._extensions[".mjs"];
  if (typeof originalMjs === "function") {
    Module._extensions[".mjs"] = function (module, filename, ...rest) {
      if (!recording.has(module)) {
        ledger.recordNode(filename, nodeRecord(module, filename, "require-esm"), {
          key: keyOf(filename),
        });
        recording.add(module);
      }
      return originalMjs.call(this, module, filename, ...rest);
    };
  }
  // JSON is module state too (`require('./config.json').flag = true`), and Node parses
  // it without compiling.
  const originalJson = Module._extensions[".json"];
  Module._extensions[".json"] = function (module, filename, ...rest) {
    ledger.recordNode(filename, nodeRecord(module, filename, "json"), { key: keyOf(filename) });
    return originalJson.call(this, module, filename, ...rest);
  };

  Object.defineProperty(globalThis, VITE_MARKER, {
    configurable: true,
    value: (key, file) => {
      drain();
      ledger.recordVite(key, file);
    },
  });
  const recordEsm = (url, deferred) => {
    if (typeof url !== "string" || !url.startsWith("file:")) return;
    const stamp = /[?&]vnhot=(\d+)/.exec(url);
    let file;
    try {
      file = fileURLToPath(url);
    } catch {
      return;
    }
    ledger.recordNode(
      file,
      { via: "esm", generation: stamp ? Number(stamp[1]) : null },
      { key: keyOf(file), deferred },
    );
  };
  // loader.mjs in this thread calls this directly, before Node evaluates the module.
  Object.defineProperty(globalThis, NODE_ESM_MARKER, {
    configurable: true,
    value: (url) => recordEsm(url, false),
  });
  // A loader on its own thread posts what it lets Node load as ESM. Drained, never
  // listened to: synchronously before each Vite evaluation (so a Node-first copy is
  // seen in order) and at the end of each file. No listener means nothing keeps the
  // worker alive and nothing throws from an event-loop callback.
  const channel = new MessageChannel();
  function drain() {
    for (let message; (message = receiveMessageOnPort(channel.port1));) {
      recordEsm(message.message, true);
    }
  }
  ledger.drain = drain;
  ledger.loaderPort = () => channel.port2;
  Object.defineProperty(globalThis, INSTALLED, { configurable: true, value: ledger });
  return ledger;
}
