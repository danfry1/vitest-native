import { expect, test } from "vitest";

test("ran in the same worker as b1", () => {
  // Without this the run could pass vacuously, one fresh worker per file.
  expect((globalThis as Record<string, unknown>).__vnNoIsolateB1Ran).toBe(true);
});

test("require() does not get the previous file's jest.mock", () => {
  expect(require("./dep").value()).toBe("real-dep");
});
