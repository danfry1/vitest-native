// A workspace library's setup file runs, and the test sees the state it set.
import { expect, test } from "vitest";
import { registry } from "@m/kit";

test("the library's setup file ran against the module the test imports", () => {
  expect(registry.setupRan, "the setup file's write is visible to the test").toBe(true);
});
