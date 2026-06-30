import { expect, test } from "vitest";
import { getCount, increment } from "./store.js";

// The key cross-file probe: if File A's mutation bled across the per-file reset,
// getCount() would start at 2 here instead of 0.
test("store is reset between files (file B sees a fresh 0)", () => {
  expect(getCount()).toBe(0);
  increment();
  expect(getCount()).toBe(1);
});
