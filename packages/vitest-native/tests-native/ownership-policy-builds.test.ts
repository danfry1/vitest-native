import { expect, it } from "vitest";

// The ESM loader and the require hooks each ask for this worker's ownership policy
// (loader.mjs initialize, hooks.mjs installRequireHooks). They ask with the same inputs,
// so the worker builds it once (ownership.mjs, workerOwnershipPolicy). Each build used to
// resolve the directory of every Node-transformed package again, in every new worker.
// Count-based: the thread's own build and request counters, read after setup.
const state = (globalThis as Record<symbol, unknown>)[
  Symbol.for("vitest-native.ownership.worker-policies")
] as { builds: number; requests: number; policies: Map<string, unknown> } | undefined;
const hot = Boolean(
  (globalThis as { __vitest_native_hot_generation?: unknown }).__vitest_native_hot_generation,
);

it.runIf(hot)("shares a build between callers under the hot runtime", () => {
  // The worker boots with one transform list and its setup file brings the
  // preset-extended one, so there can be two builds; the loader shares the second.
  expect(state).toBeDefined();
  expect(state!.builds).toBeLessThan(state!.requests);
});

it.skipIf(hot)("shares one build between the loader and the require hooks", () => {
  expect(state).toBeDefined();
  expect(state!.requests).toBeGreaterThanOrEqual(2);
  expect(state!.builds).toBe(1);
});
