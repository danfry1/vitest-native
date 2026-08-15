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
 * Which entries carry weight depends on the RNTL version, so the list is bisected
 * rather than assumed. Measured one entry at a time:
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
const KEEP_RESIDENT =
  /[\\/]node_modules[\\/](react|react-is|react-dom|scheduler|react-reconciler|react-test-renderer|test-renderer|@testing-library[\\/]react-native)[\\/]/;

export function captureModuleBaseline() {
  const baseline = new Set(Object.keys(Module._cache));
  return function resetModules() {
    let dropped = 0;
    for (const id of Object.keys(Module._cache)) {
      if (baseline.has(id) || UNRESETTABLE.test(id) || KEEP_RESIDENT.test(id)) continue;
      delete Module._cache[id];
      dropped++;
    }
    return dropped;
  };
}
