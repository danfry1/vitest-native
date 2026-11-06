import { expect, test } from "vitest";
import { count, record } from "consumer-first-load-fixture/a.js";

// First load of a.js on this worker, after another file loaded b.js from the same
// directory (see first-load-fixture/a.js). The two files run in either order.
test("a CJS re-export first loaded after a reset has its exports and fresh state", () => {
  expect(count()).toBe(0);
  record("c");
  expect(count()).toBe(1);
});
