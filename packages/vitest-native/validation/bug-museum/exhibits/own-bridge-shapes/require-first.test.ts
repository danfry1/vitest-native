// Node first: the library requires the store, then the test imports it. One instance,
// each module evaluated once.
import { expect, test } from "vitest";
import { requireStore } from "@m/feature";

test("a store Node required first is the store the test imports", async () => {
  const required = requireStore();
  const imported = await import("@m/validator/store");
  expect(imported.store, "one store").toBe(required.store);
  expect(new imported.Box(1), "one class").toBeInstanceOf(required.Box);
  expect((globalThis as { __evals?: object }).__evals, "evaluated once each").toEqual({
    store: 1,
    helper: 1,
  });
});
