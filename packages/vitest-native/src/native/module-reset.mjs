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
 * registry — and that registry has no invalidation API, so the copy a test holds
 * survives any reset. Dropping the CJS entry therefore does not replace the module;
 * it adds a twin, and the two halves of the test stack stop recognising each other.
 * The symptom is not an error about modules: it is RNTL's matchers failing to see
 * elements that a resident renderer produced.
 *
 * React, the renderers and RNTL are the load-bearing cases, and the cost of getting
 * this wrong is measured: dropping them takes the idiomatic parity suite from 135/135
 * to 82/135, and makes the run slower as well (11.1x -> 7.9x against the default
 * engine), since every file re-executes the whole test stack for nothing.
 *
 * Note for anyone re-testing this: `test:native:hot` passes either way. It exercises
 * engine mechanics, and the divergence only appears in app-shaped rendering. Use
 * `validate:hot-parity`.
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
