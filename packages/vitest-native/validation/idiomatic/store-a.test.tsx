import { expect, test } from "vitest";
import { getCount, increment } from "./store.js";

// File A mutates the module-level store. If per-file module reset works, File B
// must NOT see this mutation (the module re-evaluates and count starts at 0).
test("store starts at 0 then increments (file A)", () => {
  expect(getCount()).toBe(0);
  increment();
  increment();
  expect(getCount()).toBe(2);
});
