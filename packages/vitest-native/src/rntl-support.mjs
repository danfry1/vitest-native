// React Native Testing Library behaviour that RNTL only provides under Jest-style
// globals, installed by both engines' setup files. Plain .mjs, shipped verbatim: the
// native runtime (native/setup.mjs, native/rntl-hooks.mjs) imports it by relative path,
// and the mock engine's bundled setup.ts imports the same source. The two copies share
// state only through the global symbol below, never through module identity.
import fs from "node:fs";
import Module from "node:module";

/** RNTL's package entry: `build/index.js` (12, 13) or `dist/index.js` (14). */
export const RNTL_ENTRY =
  /[\\/]node_modules[\\/]@testing-library[\\/]react-native[\\/](?:build|dist)[\\/]index\.js$/;

// Per-file auto-cleanup state, created by installRntlAutoCleanup. When files share a
// worker, native/rntl-hooks.mjs and native/hooks.mjs add the RNTL entries a file loads
// to `imported`.
const AUTO_CLEANUP = Symbol.for("vitest-native.rntl-auto-cleanup");

// The key Node's module cache holds `file` under, if it is cached.
function cacheKeyOf(file) {
  if (Module._cache[file]) return file;
  try {
    const real = fs.realpathSync(file);
    return Module._cache[real] ? real : null;
  } catch {
    return null;
  }
}

/**
 * The RNTL entries the running test file's own module graph imports, read from
 * Vitest's evaluated-module graph: the modules Vite evaluates, and for each module it
 * externalizes to Node, that module and the modules it required directly (a shared
 * test-utils that re-exports RNTL). With `isolate: false` and no hot runtime both the
 * graph and Node's module cache persist across files, so a later file's import loads
 * nothing again; the graph still records that the file imports it.
 */
function rntlEntriesInFileGraph() {
  const worker = globalThis.__vitest_worker__;
  const modules = worker?.evaluatedModules;
  if (typeof worker?.filepath !== "string" || typeof modules?.getModuleById !== "function") {
    return [];
  }
  const found = [];
  const seen = new Set();
  const queue = [...(modules.getModulesByFile?.(worker.filepath) ?? [])];
  while (queue.length > 0) {
    const node = queue.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    const external = node.meta?.externalize;
    if (typeof external === "string") {
      const key = cacheKeyOf(external);
      if (!key) continue;
      if (RNTL_ENTRY.test(key)) found.push(key);
      for (const child of Module._cache[key].children ?? []) {
        if (RNTL_ENTRY.test(child.id)) found.push(child.id);
      }
      continue;
    }
    for (const id of node.imports ?? []) queue.push(modules.getModuleById(id));
  }
  return found;
}

/**
 * Register RNTL's automatic cleanup through Vitest's `afterEach` when RNTL cannot.
 *
 * RNTL's entry registers it only if `afterEach` is a global (12.9 build/index.js:25,
 * 13.3 build/index.js:27, 14.1 dist/index.js:26: `if (typeof afterEach === 'function')`).
 * Vitest defines its globals only with `test.globals: true`, so with Vitest's default
 * every rendered tree stayed mounted for the rest of the file: `screen` and later
 * queries saw earlier tests' screens, and their effects kept running. With globals on,
 * RNTL registers its own hook and nothing is added here.
 *
 * The hook does what RNTL's would, and only when RNTL's would exist:
 *   - only if this file loaded RNTL's main entry. Importing
 *     `@testing-library/react-native/pure` is RNTL's documented opt-out, so the setup
 *     files never load the entry themselves and it is detected lazily, when the hook runs;
 *   - not when RNTL_SKIP_AUTO_CLEANUP is set, tested by truthiness as RNTL does
 *     (12.9 build/index.js:19, 13.3 :21, 14.1 dist/index.js:20); its
 *     `dont-cleanup-after-each` module sets it;
 *   - the cleanup each version's own hook calls: 12's synchronous `cleanup`
 *     (12.9 build/index.js:29), 13's `cleanupAsync` (13.3 build/index.js:30; its
 *     `cleanup` is the synchronous one), and 14's `cleanup`, which is async and has no
 *     `cleanupAsync` (14.1 dist/index.js:29, dist/cleanup.js:11);
 *   - after one macrotask turn, as RNTL's `flushMicroTasks` (13.3/14.1
 *     flush-micro-tasks.js:9) or 12's `flushMicroTasksLegacy` (12.9 :27) wait. RNTL uses
 *     the `setImmediate` it captured when it loaded (12.9/13.3 build/helpers/timers.js:67,
 *     14.1 dist/helpers/timers.js:74), not the current one, so a test that ends with fake
 *     timers still installed does not hang its cleanup. This hook's own wait captures the
 *     real one when the setup file runs, for the same reason. (That RNTL's capture is the
 *     real one even when fake timers are on at load is native/rntl-hooks.mjs's `jest`.)
 *
 * Order: Vitest runs `afterEach` hooks in reverse order of registration (its default
 * `sequence.hooks: 'stack'`), and a setup file registers before the test file, so this
 * cleanup runs after the file's own `afterEach` hooks. That is where RNTL's own hook
 * runs under Vitest with `test.globals: true` too, since the entry registers it on
 * import. Jest runs RNTL's cleanup before the file's hooks, so an `afterEach` that
 * expects the tree to be unmounted already sees it still mounted here.
 *
 * RNTL's entry also pairs `beforeAll`/`afterAll` to set React's act environment for the
 * file (12.9 build/index.js:32). Both engines set IS_REACT_ACT_ENVIRONMENT for every
 * file already, so that pair is not reproduced.
 *
 * @param {(fn: () => Promise<void>) => void} afterEach Vitest's `afterEach`.
 * @param {{ trackImports?: boolean }} [options] `trackImports`: set when files share a
 *   worker (the hot runtime, or `isolate: false`). RNTL then stays in Node's module
 *   cache across files, so the cache cannot tell whether this file loaded it, and a
 *   `/pure` file after one that imported the entry would be cleaned up. Instead the
 *   entries this file loads are recorded (native/rntl-hooks.mjs for its imports, and
 *   noteIfRntlEntryLoaded for Node's requires) and its module graph is read
 *   (rntlEntriesInFileGraph).
 */
export function installRntlAutoCleanup(afterEach, { trackImports = false } = {}) {
  if (typeof globalThis.afterEach === "function") return;
  const setImmediate = globalThis.setImmediate;
  const state = { imported: trackImports ? new Set() : null };
  Object.defineProperty(globalThis, AUTO_CLEANUP, {
    configurable: true,
    enumerable: false,
    value: state,
    writable: true,
  });
  afterEach(async () => {
    if (process.env.RNTL_SKIP_AUTO_CLEANUP) return;
    const entries = [];
    const files = state.imported
      ? new Set([...state.imported, ...rntlEntriesInFileGraph()])
      : Object.keys(Module._cache);
    for (const file of files) {
      if (!file.endsWith("index.js") || !RNTL_ENTRY.test(file)) continue;
      const rntl = Module._cache[file]?.exports;
      const cleanup = rntl?.cleanupAsync ?? rntl?.cleanup;
      if (typeof cleanup === "function") entries.push(cleanup);
    }
    if (entries.length === 0) return;
    await new Promise((resolve) => setImmediate(resolve));
    for (const cleanup of entries) await cleanup();
  });
}

/**
 * Record the RNTL entry whose `exports` a `require` just returned, cached or not, if
 * installRntlAutoCleanup is tracking loads for this file. Called with every require's
 * result, so anything that is not an RNTL entry's exports leaves after two property
 * checks; the cache is searched only for an object with RNTL's `render` and `cleanup`.
 * @param {unknown} exports
 */
export function noteIfRntlEntryLoaded(exports) {
  if (exports === null || typeof exports !== "object") return;
  if (!globalThis[AUTO_CLEANUP]?.imported) return;
  if (typeof exports.render !== "function" || typeof exports.cleanup !== "function") return;
  for (const key of Object.keys(Module._cache)) {
    if (RNTL_ENTRY.test(key) && Module._cache[key].exports === exports) {
      noteRntlEntryImported(key);
    }
  }
}

const LOAD_TRACKED = Symbol.for("vitest-native.rntl-load-tracking");

/**
 * Report every require's result to noteIfRntlEntryLoaded, for an engine without its
 * own require hook (the mock engine; the native engine calls it from hooks.mjs). Wraps
 * `Module._load` once per worker.
 */
export function installRntlLoadTracking() {
  if (Module._load[LOAD_TRACKED]) return;
  const load = Module._load;
  const tracked = function (...args) {
    const exports = load.apply(this, args);
    noteIfRntlEntryLoaded(exports);
    return exports;
  };
  tracked[LOAD_TRACKED] = true;
  Module._load = tracked;
}

/**
 * Record that the current file imported the RNTL entry cached under `file`. A no-op
 * unless installRntlAutoCleanup is tracking imports for this file.
 * @param {string} file
 */
export function noteRntlEntryImported(file) {
  globalThis[AUTO_CLEANUP]?.imported?.add(file);
}
