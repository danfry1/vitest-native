// React Native Testing Library behaviour that RNTL only provides under Jest-style
// globals, installed by both engines' setup files. Plain .mjs, shipped verbatim: the
// native runtime (native/setup.mjs, native/rntl-hooks.mjs) imports it by relative path,
// and the mock engine's bundled setup.ts imports the same source. The two copies share
// state only through the global symbol below, never through module identity.
import Module from "node:module";

/** RNTL's package entry: `build/index.js` (12, 13) or `dist/index.js` (14). */
export const RNTL_ENTRY =
  /[\\/]node_modules[\\/]@testing-library[\\/]react-native[\\/](?:build|dist)[\\/]index\.js$/;

// Per-file auto-cleanup state, created by installRntlAutoCleanup. Under the hot runtime
// native/rntl-hooks.mjs adds the RNTL entries a file imports to `imported`.
const AUTO_CLEANUP = Symbol.for("vitest-native.rntl-auto-cleanup");

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
 *     timers still installed does not hang its cleanup. This captures the real one when
 *     the setup file runs, for the same reason.
 *
 * RNTL's entry also pairs `beforeAll`/`afterAll` to set React's act environment for the
 * file (12.9 build/index.js:32). Both engines set IS_REACT_ACT_ENVIRONMENT for every
 * file already, so that pair is not reproduced.
 *
 * @param {(fn: () => Promise<void>) => void} afterEach Vitest's `afterEach`.
 * @param {{ trackImports?: boolean }} [options] `trackImports`: the hot runtime keeps RNTL
 *   resident in Node's module cache across files, so the cache cannot tell whether this
 *   file imported it; native/rntl-hooks.mjs reports each import instead.
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
    for (const file of state.imported ?? Object.keys(Module._cache)) {
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
 * Record that the current file imported the RNTL entry cached under `file`. A no-op
 * unless installRntlAutoCleanup is tracking imports for this file.
 * @param {string} file
 */
export function noteRntlEntryImported(file) {
  globalThis[AUTO_CLEANUP]?.imported?.add(file);
}
