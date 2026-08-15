import { expect, it } from "vitest";
import { count, record } from "resident-singleton";

// Pair of 08 — see that file for why the ESM path needs its own probe and how to
// mutation-test it. Order-independent: whichever of the two runs second fails if
// the previous file's module state survived.
it("sees a fresh ESM-imported resident singleton and then dirties it", () => {
  expect(count()).toBe(0);
  record("b");
  expect(count()).toBe(1);
});
