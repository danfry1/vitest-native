import { expect, it } from "vitest";
import { count, record } from "resident-singleton";

// The ESM twin of 04/05, which reach the same package through `require`.
//
// That pair was written around a hole rather than through it: Node's ESM registry
// has no invalidation API, so a package a test file `import`s used to keep its
// module state for the whole run, and only the CommonJS path could be asserted.
// The registry is keyed by full URL though, and the engine owns the resolve hook —
// so the per-file reset now advances a generation that is stamped onto the URL, and
// the next file gets a module Node has to evaluate again.
//
// Order-independent, like 04/05: each file asserts the singleton is clean and then
// dirties it, so whichever runs second fails if the previous file's state survived.
// Mutation-test with VITEST_NATIVE_HOT_ESM_GEN=0, which restores the old behaviour
// and must turn this red.
it("sees a fresh ESM-imported resident singleton and then dirties it", () => {
  expect(count()).toBe(0);
  record("a");
  expect(count()).toBe(1);
});
