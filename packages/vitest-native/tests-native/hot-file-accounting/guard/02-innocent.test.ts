import { expect, test } from "vitest";

// Shares the previous file's task in single-worker mode. Whether or not its own test
// runs, it must be reported: the gate fails if it is missing from the results.
test("is reported", () => {
  expect(1).toBe(1);
});
