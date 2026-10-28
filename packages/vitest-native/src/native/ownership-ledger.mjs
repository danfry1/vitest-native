// The ownership guard: a per-worker ledger of which module system evaluated each file,
// reporting a file evaluated by both while the first copy is still live. Design, the
// reasons behind each rule, measured costs and limits: docs/ownership-guard.md.
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

export const OWNERSHIP_GUARD_ENV = "VITEST_NATIVE_OWNERSHIP_GUARD";
export const OWNERSHIP_MODE_ENV = "VITEST_NATIVE_OWNERSHIP_MODE";
export const VITE_MARKER = "__vitest_native_ownership_vite";
export const OWNERSHIP_META_KEY = "vitestNativeOwnership";
// jest-compat raises it around its synchronous requireActual/requireMock loads.
export const JEST_REQUIRE_DEPTH = Symbol.for("vitest-native.jest-require-depth");
const NODE_ESM_MARKER = "__vitest_native_ownership_node_esm";
const INSTALLED = Symbol.for("vitest-native.ownership-ledger");

// The engine's own runtime (src/ or dist/): exempt, as the hot worker loads it through
// Node and the setup file through Vite, and every install in it is guarded.
export const ENGINE_RUNTIME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Forward slashes and an upper-case drive letter: Vite says `D:/a`, Node `D:\a`.
export function ledgerKey(file) {
  const forward = String(file).replace(/\\/g, "/");
  return /^[a-z]:\//.test(forward) ? forward[0].toUpperCase() + forward.slice(1) : forward;
}

// Case-insensitive by default on macOS and Windows: keys are folded there.
const FOLD_CASE = process.platform === "darwin" || process.platform === "win32";
const fold = FOLD_CASE ? (key) => key.toLowerCase() : (key) => key;

export function nodeKey(file) {
  return fold(ledgerKey(file));
}

export function realKey(file) {
  try {
    return fold(ledgerKey(fs.realpathSync(file)));
  } catch {
    return fold(ledgerKey(file));
  }
}

const NOT_THE_MODULE = /[?&](?:raw|url|inline|worker|sharedworker)\b/;

// The call the plugin appends to a module (query ids are the file's code; `?raw`,
// `?url` and worker queries serve something else). Keyed by real path through a
// per-directory cache: Vite can keep a symlinked directory in an id, and one realpath
// per directory instead of a stat or two per module kept transform time at main's.
const realDirs = new Map();
function realDir(dir) {
  let real = realDirs.get(dir);
  if (real === undefined) {
    try {
      real = fs.realpathSync.native(dir);
    } catch {
      real = dir;
    }
    realDirs.set(dir, real);
  }
  return real;
}
export function viteMarkerFor(id) {
  if (typeof id !== "string" || id.includes("\0") || NOT_THE_MODULE.test(id)) return null;
  const file = id.replace(/[?#].*$/, "");
  if (!path.isAbsolute(file) || !/\.(?:[cm]?[jt]sx?|json)$/.test(file)) return null;
  const key = nodeKey(path.join(realDir(path.dirname(file)), path.basename(file)));
  return `globalThis.${VITE_MARKER}?.(${JSON.stringify(key)}, ${JSON.stringify(file)});`;
}

// Untrusted (users can set test.env): a malformed value falls back to the default.
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
        !line.includes(ENGINE_FRAME) &&
        !/[\\/](?:vitest|vite)[\\/]dist[\\/]/.test(line),
    )
    .slice(0, 8);
}

// Pure apart from the probes it is given. Node records are per module, not per path.
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

  // On the path as spelled, not the folded key.
  const exemption = (file) => {
    if (TEST_RUNTIME_RESIDENT_PATH.test(file)) return "the test runtime (vitest, chai)";
    if (exemptDirs.some((dir) => containsPath(dir, file))) return "the engine's own runtime";
    const hit = allow.find((entry) => containsPath(entry.path, file));
    if (!hit) return null;
    allowUsed.add(hit.path);
    return `ownership.allow: ${hit.reason}`;
  };

  const liveNode = (key) => node.get(key)?.find((record) => nodeLive(record));

  function routeOf(key, nodeEntry, owner) {
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
    // A stack only when reporting: one per compile cost more than the whole ledger.
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
      outcome =
        `  Vite's copy ran; this file fails. Its top-level code had already run when this ` +
        `was seen, so the import throws and the test file fails at its end (ownership: 'error'). `;
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
    // Before Node evaluates `filename`: in error mode the throw means it never runs.
    // `deferred` records (the threaded ESM loader) arrive late and never throw.
    recordNode(filename, entry, { key = nodeKey(filename), deferred = false } = {}) {
      entry.filename = filename;
      const prior = vite.get(key);
      if (prior && viteLive(prior) && !exemption(filename)) {
        report(key, entry, prior, "node", { deferred });
      }
      const records = node.get(key);
      if (records === undefined) node.set(key, [entry]);
      else {
        // Drop only collected modules: isolateModules restores an evicted copy.
        const kept = records.filter((record) => !collected(record));
        kept.push(entry);
        node.set(key, kept);
      }
    },
    // After Vite ran the module: the marker is its last statement.
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

// Once per worker: from the setup file, or the hot worker at boot.
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
  // Plus the `mock:<id>` node vi.mock(path, { spy: true }) runs the original under.
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
        // No ESM eviction; only a hot generation stamp makes a new instance.
        return record.generation == null || record.generation === generation();
      }
      // Under the key Node cached it by (the link path with --preserve-symlinks).
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

  const keyOf = preserveSymlinks() ? realKey : nodeKey;
  const jestRequire = () => (globalThis[JEST_REQUIRE_DEPTH] ?? 0) > 0;
  const nodeRecord = (module, filename, via) => ({
    via,
    ref: new WeakRef(module),
    cacheKey: filename,
    // A string, so the record holds nothing alive. DEP0144 is documentation-only.
    parent: module.parent?.filename,
    jestRequire: jestRequire(),
  });

  const originalCompile = Module.prototype._compile;
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
  // require() of `.mjs`: Node 22.13 evaluates it without `_compile`.
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
  // JSON is module state too, and Node parses it without compiling.
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
  Object.defineProperty(globalThis, NODE_ESM_MARKER, {
    configurable: true,
    value: (url) => recordEsm(url, false),
  });
  // The off-thread loader posts its ESM loads here. Drained (never listened to) at each
  // Vite evaluation and each file end: nothing keeps the worker alive or throws late.
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
