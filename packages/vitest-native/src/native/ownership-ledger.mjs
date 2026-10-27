/**
 * The ownership guard: a per-worker ledger of which module system evaluated each file.
 *
 * Under the native engine Node and Vite both evaluate modules in one worker. A file
 * evaluated by both exists twice, with two copies of its state, and nothing throws: a
 * store written through one copy reads back unset through the other. The policy in
 * ownership.mjs decides who SHOULD own a file. This records who actually evaluated it,
 * and reports the moment a file reaches the second side while the first copy is still
 * live. Design, routes and rollout: docs/ownership-guard.md.
 *
 * Node side: a wrapper on Module.prototype._compile (every CommonJS evaluation, from
 * whichever hook compiled it), plus loader.mjs for true ESM while the loader runs in
 * this thread. Vite side: a call the plugin appends to every module it transforms
 * (VITE_MARKER), which runs as the module finishes evaluating.
 *
 * Cost is one Map lookup per evaluation. A hit is checked for LIVENESS before anything
 * is reported, which is what keeps per-file resets correct without hooks of their own:
 * the hot reset, jest.resetModules and isolateModules all drop the first copy, and a
 * dropped copy cannot split state with the next one.
 */
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
/** The global the plugin's appended call reaches. */
export const VITE_MARKER = "__vitest_native_ownership_vite";
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
 * keys). Real-pathing is the caller's job: Node's filenames already are real paths, and
 * the plugin real-paths Vite's ids when it writes the marker.
 */
export function ledgerKey(file) {
  const forward = String(file).replace(/\\/g, "/");
  return /^[a-z]:\//.test(forward) ? forward[0].toUpperCase() + forward.slice(1) : forward;
}

/** The marker the plugin appends to a module it hands Vite's runner, or null. */
export function viteMarkerFor(id) {
  if (typeof id !== "string" || id.includes("\0") || id.includes("?")) return null;
  if (!path.isAbsolute(id) || !/\.[cm]?[jt]sx?$/.test(id)) return null;
  let real = id;
  try {
    real = fs.realpathSync(id);
  } catch {
    // A module with no file on disk is nothing Node could load either.
    return null;
  }
  return `\n;globalThis.${VITE_MARKER}?.(${JSON.stringify(ledgerKey(real))}, ${JSON.stringify(id)});\n`;
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
      "owns whose source imports a sibling through a resolve.alias. Keep both packages " +
      "on one side: alias neither to source, or alias both.",
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
    label: "Vite evaluated a file Node had already loaded",
    fix:
      "A server.deps.inline rule, Vitest's default inlining or an alias sent Vite to a " +
      "file Node already holds. Remove the rule or alias that gives it to Vite.",
  },
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
 */
export function createOwnershipLedger({
  mode = "warn",
  allow = [],
  exemptDirs = [ENGINE_RUNTIME_DIR],
  nodeLive = () => true,
  viteLive = () => true,
  viteImporter = () => null,
  ownerOf = () => null,
  warn = (message) => console.warn(message),
} = {}) {
  const node = new Map();
  const vite = new Map();
  const reported = new Set();
  const conflicts = [];

  const exemption = (key) => {
    if (TEST_RUNTIME_RESIDENT_PATH.test(key)) return "the test runtime (vitest, chai)";
    if (exemptDirs.some((dir) => containsPath(dir, key))) return "the engine's own runtime";
    const hit = allow.find((entry) => containsPath(entry.path, key));
    return hit ? `ownership.allow: ${hit.reason}` : null;
  };

  // How the Node copy came to exist: that is the actionable half, since the policy
  // usually gives the file to Vite. Classified from the requiring parent, and from the
  // stack, which is captured only for project files.
  function routeOf(nodeEntry) {
    if (nodeEntry.via === "esm") return "node-esm";
    if (/\b(?:requireActual|requireMock)\b/.test(nodeEntry.stack ?? "")) return "jest-compat";
    const parent = nodeEntry.parent;
    if (typeof parent === "string" && NODE_MODULES_PATH.test(parent)) return "installed-package";
    if (typeof parent === "string" && node.has(ledgerKey(parent))) return "node-owned-source";
    return "require-from-vite";
  }

  function report(key, nodeEntry, viteEntry, second) {
    const owner = ownerOf(nodeEntry.filename);
    // Vite reaching a file Node owns, or one in node_modules, is the inline/alias case.
    const route =
      second === "vite" && (owner?.owner === "node" || NODE_MODULES_PATH.test(key))
        ? "vite-inline"
        : routeOf(nodeEntry);
    const { label, fix } = ROUTES[route];
    const ownerName = { node: "Node", vite: "Vite", "vitest-default": "none declared" };
    const ownerLine = owner
      ? `${ownerName[owner.owner] ?? owner.owner} (${owner.reason})`
      : "unknown";
    const parent = nodeEntry.parent ?? "(no parent recorded)";
    const importer = viteImporter(viteEntry) ?? "(no importer recorded)";
    const nodeLine = `Node (${nodeEntry.via === "esm" ? "ESM loader" : "CommonJS"}), required by ${parent}`;
    const viteLine = `Vite, imported by ${importer}`;
    const conflict = Object.freeze({
      code: "MODULE_DUAL_EVALUATION",
      file: nodeEntry.filename,
      first: second === "vite" ? "node" : "vite",
      second,
      route,
      owner: owner?.owner ?? null,
    });
    const stack = frames(nodeEntry.stack);
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
      (mode === "error"
        ? `  The second copy was not evaluated (ownership: 'error'). `
        : `  This is a warning today and an error from the next minor; set ` +
          `reactNative({ ownership: 'error' }) to fail now. `) +
      `A deliberate case can be exempted with ownership.allow: [{ path, reason }] ` +
      `(docs/ownership-guard.md).`;
    conflicts.push(conflict);
    if (mode === "error") {
      throw new VitestNativeError("MODULE_DUAL_EVALUATION", message);
    }
    if (reported.has(key)) return;
    reported.add(key);
    warn(message);
  }

  return {
    mode,
    conflicts,
    /**
     * Node is about to evaluate `filename`. Throws in error mode BEFORE the code runs,
     * so the second copy never exists.
     */
    recordNode(filename, entry) {
      const key = ledgerKey(filename);
      const record = entry;
      record.filename = filename;
      // A stack for project files only: they are what this guard hunts, and they are
      // rarely compiled by Node at all. node_modules compiles stay at one lookup.
      if (record.stack === undefined && !NODE_MODULES_PATH.test(key)) {
        record.stack = new Error().stack;
      }
      const prior = vite.get(key);
      if (prior && viteLive(prior) && !exemption(key)) report(key, record, prior, "node");
      node.set(key, record);
    },
    /** Vite finished evaluating the module whose real-path key is `key`. */
    recordVite(key, file) {
      const entry = { file, key };
      const prior = node.get(key);
      if (prior && nodeLive(prior) && !exemption(key)) report(key, prior, entry, "vite");
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
  const ledger = createOwnershipLedger({
    mode: config.mode,
    allow: config.allow.map((entry) => ({
      ...entry,
      path: path.resolve(projectRoot, entry.path),
    })),
    ownerOf,
    nodeLive: (entry) => {
      if (entry.via === "esm") {
        // Node's ESM registry has no eviction. Only a hot generation stamp makes the
        // next import a different instance (versionable in loader.mjs).
        return entry.generation == null || entry.generation === generation();
      }
      return Module._cache[entry.filename] === entry.module;
    },
    viteLive: (entry) => {
      const graph = globalThis.__vitest_worker__?.evaluatedModules;
      if (typeof graph?.getModulesByFile !== "function") return true;
      const nodes = graph.getModulesByFile(entry.file) ?? graph.getModulesByFile(entry.key);
      for (const node of nodes ?? []) if (node.evaluated || node.promise) return true;
      return false;
    },
    viteImporter: (entry) => {
      const graph = globalThis.__vitest_worker__?.evaluatedModules;
      const nodes = graph?.getModulesByFile?.(entry.file);
      for (const node of nodes ?? []) {
        const importer = node.importers?.values().next().value;
        if (importer) return importer;
      }
      return null;
    },
  });

  const real = preserveSymlinks()
    ? (file) => {
        try {
          return fs.realpathSync(file);
        } catch {
          return file;
        }
      }
    : (file) => file;
  const originalCompile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename, ...rest) {
    if (typeof filename === "string") {
      ledger.recordNode(real(filename), {
        via: "cjs",
        module: this,
        // The requirer: the module that first loaded this one. `module.parent` is a
        // documentation-only deprecation (DEP0144): no warning unless the run passes
        // --pending-deprecation.
        parent: this.parent?.filename,
      });
    }
    return originalCompile.call(this, content, filename, ...rest);
  };
  Object.defineProperty(globalThis, VITE_MARKER, {
    configurable: true,
    value: (key, file) => ledger.recordVite(key, file),
  });
  // loader.mjs calls this for true ESM it lets Node load. Off-thread loaders run in
  // another realm, where it is undefined; their ESM is outside the ledger.
  Object.defineProperty(globalThis, NODE_ESM_MARKER, {
    configurable: true,
    value: (url, parentURL) => {
      if (!url.startsWith("file:")) return;
      const stamp = /[?&]vnhot=(\d+)/.exec(url);
      let file;
      try {
        file = real(fileURLToPath(url));
      } catch {
        return;
      }
      ledger.recordNode(file, {
        via: "esm",
        generation: stamp ? Number(stamp[1]) : null,
        parent: parentURL?.startsWith("file:") ? fileURLToPath(parentURL) : parentURL,
      });
    },
  });
  Object.defineProperty(globalThis, INSTALLED, { configurable: true, value: ledger });
  return ledger;
}
