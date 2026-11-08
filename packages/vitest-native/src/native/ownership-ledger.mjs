// The ownership guard: a per-worker ledger of which module system evaluated each file,
// reporting a file evaluated by both while the first copy is still live. Design, the
// reasons behind each rule, measured costs and limits: docs/ownership-guard.md.
import { nodeDispatch } from "../node-dispatch.mjs";
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NODE_MODULES_PATH } from "./match.mjs";
import {
  INSTALLED_TYPESCRIPT,
  TEST_RUNTIME_RESIDENT_PATH,
  createNativeOwnershipPolicy,
  parseNativeOwnershipManifest,
} from "./ownership.mjs";
import { VitestNativeError } from "../errors.mjs";
import { projectContext } from "../context.mjs";
import { docsUrl } from "../docs-url.mjs";

/**
 * The engine's dispatcher channel the ledger lives on (node-dispatch.mjs): `ledger`, and
 * the records it receives from outside the worker's own code, `.vite(key, file)` from the
 * call appended to each Vite module and `.nodeEsm(url)` from the in-thread loader hook
 * (loader.mjs); jest-compat raises `jestRequireDepth` around its synchronous
 * requireActual/requireMock loads.
 */
export const OWNERSHIP_CHANNEL = "ownership";
/**
 * How code Vite runs reaches the ledger: through the dispatcher, whose one per-worker
 * global it shares, rather than a global of its own.
 */
export const OWNERSHIP_ACCESS = `globalThis[Symbol.for("vitest-native.node-dispatch")]?.channel(${JSON.stringify(OWNERSHIP_CHANNEL)})`;
export const OWNERSHIP_META_KEY = "vitestNativeOwnership";

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

// The OS's spelling of the whole path (realpathOr), as both sides of the installed ledger
// are keyed (fileKey).
export function realKey(file) {
  return fold(ledgerKey(realpathOr(file, file)));
}

// Every key an allow entry or exempt directory can be met under: the OS's spelling, and
// Node's (fs.realpathSync, which keeps a Windows 8.3 short name), so it matches whichever
// spelling a side recorded the file in.
function realKeys(file) {
  return [...new Set([realKey(file), fold(ledgerKey(nodeRealpathOr(file)))])].map((key) =>
    key.replace(/\/+$/, ""),
  );
}

function nodeRealpathOr(file) {
  try {
    // Node's spelling (fs.realpathSync): the one a ledger keyed as given (nodeKey) holds.
    return fs.realpathSync(file);
  } catch {
    // Missing: kept as written, so the entry matches nothing until it exists.
    return file;
  }
}

const NOT_THE_MODULE = /[?&](?:raw|url|inline|worker|sharedworker)\b/;

// The call the plugin appends to a module (query ids are the file's code; `?raw`,
// `?url` and worker queries serve something else). Keyed by real path through a
// per-directory cache: Vite can keep a symlinked directory in an id, and one realpath
// per directory instead of a stat or two per module kept transform time at main's.
const realDirs = new Map();
function realpathOr(file, fallback) {
  try {
    // The OS's spelling (realpathSync.native), as Vite's ids are: viteMarkerFor keys Vite's
    // side by it.
    return fs.realpathSync.native(file);
  } catch {
    return fallback;
  }
}
function realDir(dir) {
  // Keyed by the resolved path: on Windows, Vite's ids say `D:/a` and Node's file names
  // `D:\a`, which would otherwise cost each directory two realpaths.
  // A directory not on disk keeps the spelling it was given.
  const at = path.resolve(dir);
  let real = realDirs.get(at);
  if (real === undefined) {
    real = realpathOr(at, dir);
    realDirs.set(at, real);
  }
  return real;
}
/**
 * The one key both sides of the ledger use for a file: its directory's native real path
 * (cached per directory) and its name. Node's file name keeps the spelling it was reached
 * by, a Windows 8.3 short name (RUNNER~1) when the path was built on a root given that
 * way, while Vite's ids are long: keyed as given, the two copies of one file never met.
 */
export function fileKey(file) {
  return nodeKey(path.join(realDir(path.dirname(file)), path.basename(file)));
}

export function viteMarkerFor(id) {
  if (typeof id !== "string" || id.includes("\0") || NOT_THE_MODULE.test(id)) return null;
  const file = id.replace(/[?#].*$/, "");
  if (!path.isAbsolute(file) || !/\.(?:[cm]?[jt]sx?|json)$/.test(file)) return null;
  const key = fileKey(file);
  return `${OWNERSHIP_ACCESS}.vite?.(${JSON.stringify(key)}, ${JSON.stringify(file)});`;
}

// The project context's `ownershipGuard` (or its JSON). A malformed value falls back to
// the default rather than stopping the run.
export function parseOwnershipGuardConfig(raw) {
  const fallback = { mode: "warn", allow: [] };
  if (!raw) return fallback;
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
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

export const OWNERSHIP_ROUTES = {
  "jest-compat": {
    label: "a synchronous jest.requireActual/requireMock through jest-compat",
    fix:
      "Vite had not evaluated the file yet, so Node loaded its own copy. Import the " +
      "module statically before the jest.mock that needs it, or load it with " +
      "`await vi.importActual(...)` inside an async factory. Or set " +
      "reactNative({ experimental: { ownershipModel: 'resolution' } }), which gives " +
      "Node's require of your source Vite's instance.",
  },
  "require-from-vite": {
    label: "require() in a file Vite evaluated",
    fix:
      "Vitest's `require` inside a test or source file is Node's. Use `import`, or, in " +
      "a jest.mock factory, load it with `await vi.importActual(...)` in an async " +
      "factory, so the file stays in Vite's graph. Or set " +
      "reactNative({ experimental: { ownershipModel: 'resolution' } }), which gives " +
      "Node's require of your source Vite's instance.",
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
  "installed-typescript": {
    label: "an installed package's TypeScript source, required and imported",
    fix:
      "Vitest gives Vite an installed package's TypeScript source, which Node also " +
      "compiles for a require. Set reactNative({ experimental: { nodeMocks: true } }): " +
      "Node then loads it once for both, and a vi.mock still reaches it.",
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
  // Whether Node holds `file` now, loaded or still loading: a requirer Node is still
  // evaluating is not recorded yet (Node's copies are recorded once they have loaded).
  nodeHolds = () => false,
  // The key a Node file name is recorded under, so parents are looked up by the same one
  // (installOwnershipLedger passes fileKey, or realKey with --preserve-symlinks).
  keyOf = nodeKey,
  warn = (message) => console.warn(message),
} = {}) {
  const node = new Map();
  const vite = new Map();
  const reported = new Set();
  // The causes already printed in this worker, with how many files each has had since.
  const printed = new Map();
  const conflicts = [];
  const allowUsed = new Set();

  // On the ledger key (real path, folded where the file system ignores case), the same
  // whichever side was second: Node's filename and Vite's id can spell one file apart.
  const within = (dirKey, key) => key === dirKey || key.startsWith(`${dirKey}/`);
  const exemptKeys = exemptDirs.flatMap((dir) => realKeys(dir));
  const allowKeys = allow.flatMap((entry) => realKeys(entry.path).map((key) => ({ entry, key })));
  const exemption = (key) => {
    if (TEST_RUNTIME_RESIDENT_PATH.test(key)) return "the test runtime (vitest, chai)";
    if (exemptKeys.some((dir) => within(dir, key))) return "the engine's own runtime";
    const hit = allowKeys.find((candidate) => within(candidate.key, key))?.entry;
    if (!hit) return null;
    allowUsed.add(hit.path);
    return `ownership.allow: ${hit.reason}`;
  };

  const liveNode = (key) => node.get(key)?.find((record) => nodeLive(record));

  function routeOf(key, nodeEntry, owner) {
    // Only with nodeMocks off: with it on, the policy gives these files to Node (#544).
    if (NODE_MODULES_PATH.test(key) && INSTALLED_TYPESCRIPT.test(key)) {
      return "installed-typescript";
    }
    if (owner?.owner === "node" || NODE_MODULES_PATH.test(key)) return "vite-inline";
    if (nodeEntry.via === "esm") return "node-esm";
    if (nodeEntry.jestRequire) return "jest-compat";
    const parent = nodeEntry.parent;
    if (typeof parent === "string" && NODE_MODULES_PATH.test(parent)) return "installed-package";
    if (typeof parent === "string" && (node.has(keyOf(parent)) || nodeHolds(parent))) {
      return "node-owned-source";
    }
    return "require-from-vite";
  }

  /**
   * Where Node's load of a file began: up its chain of Node-loaded parents to the first
   * one whose parent Node did not load (a test file, a file Vite evaluated, an installed
   * package). Every file one `require` pulls in shares it, so they are one cause: a jest.mock
   * factory's require of a module that imports 600 others is one finding, not 600. The
   * walk stops below a parent the policy gives Node (a workspace package Node owns):
   * that code reaching a file Vite owns is the cause itself.
   */
  function originOf(nodeEntry) {
    const seen = new Set([nodeEntry]);
    let entry = nodeEntry;
    for (;;) {
      const parent = entry.parent;
      if (typeof parent !== "string" || NODE_MODULES_PATH.test(parent)) return entry;
      if (ownerOf(parent)?.owner === "node") return entry;
      // A live copy only: under the hot runtime an earlier generation's record can remain.
      const up = liveNode(keyOf(parent));
      if (up === undefined || seen.has(up)) return entry;
      seen.add(up);
      entry = up;
    }
  }

  function report(key, nodeEntry, viteEntry, second) {
    const owner = ownerOf(nodeEntry.filename);
    const route = routeOf(key, nodeEntry, owner);
    const { label } = OWNERSHIP_ROUTES[route];
    const origin = originOf(nodeEntry);
    const originRoute =
      origin === nodeEntry
        ? route
        : routeOf(keyOf(origin.filename), origin, ownerOf(origin.filename));
    const cause = { route: originRoute, file: origin.filename };
    const causeKey = `${originRoute}\0${origin.filename}`;
    // The fix is the cause's: the files a require pulled in name their importer as the
    // route, but what fixes them all is fixing that require.
    const { fix } = OWNERSHIP_ROUTES[originRoute];
    const originLine =
      origin === nodeEntry
        ? ""
        : `  origin       -> ${origin.filename}, which Node loaded through ` +
          `${OWNERSHIP_ROUTES[originRoute].label}, and which loaded this file\n`;
    const ownerName = { node: "Node", vite: "Vite", "vitest-default": "none declared" };
    const ownerLine = owner
      ? `${ownerName[owner.owner] ?? owner.owner} (${owner.reason})`
      : "unknown";
    const parent = nodeEntry.parent ?? "(no parent recorded)";
    const importer = viteImporter(viteEntry) ?? "(no importer recorded)";
    const nodeLine = `Node (${VIA[nodeEntry.via] ?? nodeEntry.via}), required by ${parent}`;
    const viteLine = `Vite, imported by ${importer}`;
    // A stack only when reporting: one per compile cost more than the whole ledger.
    const stack = second === "node" ? frames(new Error().stack) : [];
    let outcome;
    if (mode !== "error") {
      outcome = `  This is a warning; set reactNative({ ownership: 'error' }) to fail on it. `;
    } else if (second === "node" && nodeEntry.via === "esm") {
      outcome = `  Node's copy was never evaluated: the import threw (ownership: 'error'). `;
    } else if (second === "node") {
      outcome =
        `  Node's copy ran, as Node reports a module once it has loaded; the require threw ` +
        `(ownership: 'error'). `;
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
      originLine +
      `  fix          -> ${fix}\n` +
      (stack.length > 0
        ? `  Node stack:\n${stack.map((line) => `    ${line}`).join("\n")}\n`
        : "") +
      outcome +
      `A deliberate case can be exempted with ownership.allow: [{ path, reason }] ` +
      `(${docsUrl("/guide/errors#SOURCE_EVALUATED_TWICE")}).`;
    conflicts.push(
      Object.freeze({
        code: "SOURCE_EVALUATED_TWICE",
        file: nodeEntry.filename,
        first: second === "vite" ? "node" : "vite",
        second,
        route,
        cause,
        via: nodeEntry.via,
        owner: owner?.owner ?? null,
        message,
      }),
    );
    if (mode === "error") {
      throw new VitestNativeError("SOURCE_EVALUATED_TWICE", message);
    }
    if (reported.has(key)) return;
    reported.add(key);
    // One full warning per cause in this worker; the end-of-run summary counts the rest.
    const count = printed.get(causeKey);
    printed.set(causeKey, (count ?? 0) + 1);
    if (count !== undefined) return;
    warn(
      `${message}\n  Other files with the same origin are not printed here; the summary ` +
        `at the end of the run counts them.`,
    );
  }

  return {
    mode,
    conflicts,
    allowUsed,
    // When Node evaluates `filename`: before an ES module runs (the loader's hook), so in
    // error mode the throw means it never runs; once a CommonJS module has loaded (the
    // dispatcher's report), so the throw fails the require after it ran.
    recordNode(filename, entry, { key = keyOf(filename) } = {}) {
      entry.filename = filename;
      const records = node.get(key);
      if (records === undefined) node.set(key, [entry]);
      else {
        // Drop only collected modules (isolateModules restores an evicted copy) and ES
        // module records of an earlier hot generation, which can never be live again.
        const stale = (record) =>
          record.via === "esm" &&
          record.generation != null &&
          entry.generation != null &&
          record.generation !== entry.generation;
        const kept = records.filter((record) => !collected(record) && !stale(record));
        kept.push(entry);
        node.set(key, kept);
      }
      // Recorded first, so a copy error mode refuses is still known to a later Vite load.
      const prior = vite.get(key);
      if (prior && viteLive(prior) && !exemption(key)) {
        report(key, entry, prior, "node");
      }
    },
    // After Vite ran the module: the marker is its last statement.
    recordVite(key, file) {
      const entry = { file, key };
      const prior = liveNode(key);
      if (prior && !exemption(key)) report(key, prior, entry, "vite");
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
  const channel = nodeDispatch().channel(OWNERSHIP_CHANNEL);
  if (channel.ledger) return channel.ledger;
  const context = projectContext();
  const config = parseOwnershipGuardConfig(context?.ownershipGuard);
  let policy;
  const ownerOf = (file) => {
    if (policy === undefined) {
      const manifest = parseNativeOwnershipManifest(context?.ownership);
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
  // One spelling for both sides (fileKey): Node's file names as Vite's ids are keyed.
  const keyOf = preserveSymlinks() ? realKey : fileKey;
  const ledger = createOwnershipLedger({
    keyOf,
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
    nodeHolds: (file) => Module._cache[file] !== undefined,
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

  // Raised by jest-compat while a jest.require* call loads (node-registry.mjs).
  const jestRequire = () => (channel.jestRequireDepth ?? 0) > 0;

  // Every module Node's CommonJS loader evaluates, reported by the engine's dispatcher once
  // it has loaded: CommonJS, require() of an ES module, and JSON. A copy whose evaluation
  // throws is not reported: Node drops it from its cache, so it leaves no twin. In error
  // mode the require fails here, after Node's copy ran.
  nodeDispatch().onNodeEvaluation(({ filename, module, via }) => {
    try {
      ledger.recordNode(
        filename,
        {
          via,
          ref: new WeakRef(module),
          cacheKey: filename,
          // A string, so the record holds nothing alive. DEP0144 is documentation-only.
          parent: module.parent?.filename,
          jestRequire: jestRequire(),
        },
        { key: keyOf(filename) },
      );
    } catch (error) {
      // Error mode refused Node's copy after it loaded: take it out of Node's cache, as
      // Node does for a module that throws, so no later require is handed it.
      if (Module._cache[filename] === module) delete Module._cache[filename];
      throw error;
    }
  });

  const fileOf = (url) => {
    if (typeof url !== "string" || !url.startsWith("file:")) return null;
    try {
      return fileURLToPath(url);
    } catch {
      return null;
    }
  };
  // True ESM, from loader.mjs's load hook in this thread, before Node evaluates it.
  channel.nodeEsm = (url) => {
    const file = fileOf(url);
    if (file === null) return;
    const stamp = /[?&]vnhot=(\d+)/.exec(url);
    ledger.recordNode(
      file,
      { via: "esm", generation: stamp ? Number(stamp[1]) : null },
      { key: keyOf(file) },
    );
  };
  // The marker viteMarkerFor writes into each module Vite evaluates.
  channel.vite = (key, file) => ledger.recordVite(key, file);
  channel.ledger = ledger;
  return ledger;
}
