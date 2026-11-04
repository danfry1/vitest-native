/**
 * A vi.doMock Vitest has not registered yet (it registers on the test's next import)
 * fails by name for a require of that file, and only for that file (R7, R9).
 */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

it("names a pending vi.doMock of the required file", () => {
  vi.doMock("dispatch-target-lib", () => ({ source: "pending" }));
  expect(() => requireFrom("dispatch-target-lib")).toThrow(
    expect.objectContaining({ code: "MOCK_NOT_SEEN_BY_NODE" }),
  );
});

it("leaves another file with the same specifier alone", () => {
  // `./index.js` from this test is no file; from the installed package it is its own.
  vi.doMock("./index.js", () => ({ pending: true }));
  expect(() => requireFrom("./index.js")).not.toThrow();
});

it("serves it once the next import has registered it", async () => {
  vi.doMock("dispatch-target-lib", () => ({ source: "registered" }));
  await import("dispatch-target-lib");
  expect(requireFrom("dispatch-target-lib").source).toBe("registered");
});
