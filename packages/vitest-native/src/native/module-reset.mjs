// Per-file reset of the worker's Node module graph (hot runtime).
//
// The hot runtime keeps a worker alive across test files — that is where its speed
// comes from, since a fresh worker costs ~200ms of boot and that dominates a run at
// scale. What it must not keep is state. Vitest's own per-file reset covers the
// module-runner graph; everything Vitest externalizes lives in Node's require cache,
// outside its reach.
//
// Anything the worker loaded to bootstrap ITSELF stays; anything a TEST FILE caused
// to load is dropped and runs again on the next file.
import Module from "node:module";
import { isRuntimeResidentFile } from "./ownership.mjs";
import { VitestNativeError } from "../errors.mjs";

// Capture before the worker installs registry/preset _load interceptors.
const nodeLoad = Module._load;
const CLEANUP_ID = "\0vitest-native:cjs-cache-drain";

function cleanupError(detail, cause) {
  return new VitestNativeError(
    "HOT_CJS_CACHE_RESET",
    `Cannot safely reset Node's CommonJS cache between test files: ${detail} ` +
      "A custom loader may be incompatible with hot cleanup. " +
      "Set hotRuntime:false to use worker isolation.",
    cause === undefined ? undefined : { cause },
  );
}

/**
 * Compatibility bridge for Node's stale relativeResolveCache fast path.
 *
 * Deleting require.cache is insufficient: subsequent ESM re-export discovery can
 * insert unloaded CJS placeholders which an old relative lookup mistakes for a
 * circular require. Observed on Node 20/22/24; see node-cjs-cache-investigation.md.
 *
 * After all per-file entries are deleted, dry-run only their recorded lookup
 * keys. Node drops each stale key, then our temporary resolver returns an already
 * loaded sentinel, before any source executes. Fake parents keep sentinel children
 * out of real module graphs. This remains an internal-API compatibility bridge,
 * not a public Node cache API; replace it when the upstream fix is supported.
 *
 * Install after require hooks/preload, before tests. drain() is synchronous and
 * must run immediately after cache deletion, before the next file starts loading.
 */
export function trackCjsResolutions() {
  const originalResolve = Module._resolveFilename;
  const edges = new Map();
  const sentinel = {};
  let count = 0;
  const resolver = function (request, parent, ...rest) {
    const filename = originalResolve.call(this, request, parent, ...rest);
    if (parent && typeof parent.path === "string" && !Module.isBuiltin(filename)) {
      edges.set(`${parent.path}\0${request}`, { request, parentPath: parent.path, filename });
    }
    return filename;
  };
  Module._resolveFilename = resolver;
  return {
    drain() {
      // A later wrapper can short-circuit our tracker, leaving *zero* recorded
      // edges despite stale Node lookups. Check before the empty-map fast path.
      if (Module._resolveFilename !== resolver) {
        throw cleanupError("the tracking resolver was replaced after installation.");
      }
      const stale = [];
      for (const edge of edges.values()) {
        if (!Object.hasOwn(Module._cache, edge.filename)) stale.push(edge);
      }
      // Retained targets stay retained by baseline/residency policy. Release
      // their per-file aliases too, rather than accumulate worker-long metadata.
      edges.clear();
      if (!stale.length) return 0;
      if (Object.hasOwn(Module._cache, CLEANUP_ID)) {
        throw cleanupError("the reserved cleanup cache entry is already in use.");
      }
      const savedResolve = Module._resolveFilename;
      const savedLoad = Module.prototype.load;
      Module._cache[CLEANUP_ID] = { loaded: true, exports: sentinel };
      Module._resolveFilename = () => CLEANUP_ID;
      Module.prototype.load = () => {
        throw cleanupError("cache-drain attempted module execution.");
      };
      try {
        for (const { request, parentPath } of stale) {
          const parent = { path: parentPath, children: [] };
          if (nodeLoad(request, parent, false) !== sentinel) {
            throw cleanupError("a loader bypassed the cleanup resolver.");
          }
          count++;
        }
      } catch (error) {
        if (error?.code === "HOT_CJS_CACHE_RESET") throw error;
        throw cleanupError("the cleanup lookup failed.", error);
      } finally {
        Module._resolveFilename = savedResolve;
        Module.prototype.load = savedLoad;
        delete Module._cache[CLEANUP_ID];
      }
      return stale.length;
    },
    get count() {
      return count;
    },
    get pending() {
      return edges.size;
    },
    // Used by standalone contract tests; the production tracker lives as long
    // as its worker. Never remove a subsequently installed third-party wrapper.
    dispose() {
      if (Module._resolveFilename !== resolver) {
        throw cleanupError("another resolver wrapped the tracking hook.");
      }
      Module._resolveFilename = originalResolve;
      edges.clear();
    },
  };
}

// Native addons cannot be unloaded — dropping one and requiring it again
// re-initialises native state in the same process, which crashes some addons.
const UNRESETTABLE = /\.node$/;

/**
 * Modules that must NOT be dropped, because dropping them creates a second copy
 * rather than a fresh one.
 *
 * Test files reach these through ESM `import`, which caches them in Node's ESM
 * registry. Dropping the CJS entry therefore does not replace the module; it adds a
 * twin, and the two halves of the test stack stop recognising each other. The symptom
 * is not an error about modules: it is RNTL's matchers failing to see elements that a
 * resident renderer produced.
 *
 * The ESM registry is not reachable from here — it has no invalidation API — but it
 * IS keyed by full URL, and the engine owns the resolve hook, so the loader gives
 * every other externalized package a per-file generation stamp instead (see
 * `versionable` in loader.mjs). The entries below are exempt from that on purpose:
 * for them a fresh instance is the bug, not the fix.
 *
 * Which entries carry weight depends on the RNTL version, so the resident policy in
 * ownership.mjs is bisected rather than assumed. Measured one entry at a time:
 *
 *   @testing-library/react-native  RNTL 14: parity 135/135 -> 81/135, 10.4x -> 7.8x.
 *                                  The dominant case on every version.
 *   react-test-renderer,           RNTL 13: `test:native:hot` 175 -> 173 passing.
 *   test-renderer                  RNTL 14 does not use them and is unaffected —
 *                                  which is why a single-version check calls them
 *                                  dead and is wrong.
 *   react, react-is, react-dom,    No measured effect on either suite under RNTL 13
 *   scheduler, react-reconciler    or 14: React is already loaded by the worker's
 *                                  boot-time RN preload, so the baseline snapshot
 *                                  below protects it before this pattern is
 *                                  consulted. Kept because that protection is a
 *                                  side effect of preload contents, not a contract.
 *
 * Note for anyone re-testing this: the two suites disagree, so run both.
 * `validate:hot-parity` is the only one that sees the RNTL regression (it is
 * app-shaped rendering); `test:native:hot` is the only one that sees the
 * react-test-renderer regression (it is engine mechanics).
 */
export function captureModuleBaseline() {
  const baseline = new Set(Object.keys(Module._cache));
  const resolutions = trackCjsResolutions();
  return function resetModules() {
    let dropped = 0;
    for (const id of Object.keys(Module._cache)) {
      if (baseline.has(id) || UNRESETTABLE.test(id) || isRuntimeResidentFile(id)) continue;
      delete Module._cache[id];
      dropped++;
    }
    resolutions.drain();
    return dropped;
  };
}

// Vitest's own runtime stays evaluated, as Vitest's `resetModules` leaves it.
const VITEST_RUNTIME = [/\/vitest\/dist\//, /vitest-virtual-\w+\/dist/, /@vitest\/dist/];

/**
 * Clear the evaluation state of every node in a module runner's graph except Vitest's
 * own: the fields Vitest's `resetModules(modules, resetMocks = true)` clears
 * (vitest/dist/chunks/utils). With `saved`, each node's state is recorded first, for
 * `restoreEvaluatedModules`.
 */
export function resetEvaluatedModules(map, saved) {
  for (const [id, node] of map) {
    if (VITEST_RUNTIME.some((re) => re.test(id))) continue;
    saved?.set(node, [node.promise, node.exports, node.evaluated, [...node.importers]]);
    node.promise = undefined;
    node.exports = undefined;
    node.evaluated = false;
    node.importers.clear();
  }
}

/** Put back what `resetEvaluatedModules` saved; nodes evaluated since are reset. */
export function restoreEvaluatedModules(map, saved) {
  resetEvaluatedModules(map);
  for (const [node, [promise, exports, evaluated, importers]] of saved) {
    Object.assign(node, { promise, exports, evaluated });
    for (const importer of importers) node.importers.add(importer);
  }
}
