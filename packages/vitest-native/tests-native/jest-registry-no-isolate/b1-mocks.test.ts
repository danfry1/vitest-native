import { expect, test } from "vitest";

// Mocks ./dep for this file only. With `isolate: false` the next files run in this
// same worker, without the hot runtime's per-file reset.
jest.mock("./dep", () => ({ value: () => "mocked-in-b1" }));

(globalThis as Record<string, unknown>).__vnNoIsolateB1Ran = true;

test("this file's mock reaches require()", () => {
  expect(require("./dep").value()).toBe("mocked-in-b1");
});
