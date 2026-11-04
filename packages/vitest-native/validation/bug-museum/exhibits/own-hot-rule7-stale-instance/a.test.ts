// First file in the worker: Node-owned code loads the store before the test imports it
// (own-require-first's order). It asserts nothing about the store: whether this file sees
// one instance is own-require-first's bug, not this exhibit's.
import { expect, test } from "vitest";
import { readStore } from "@m/feature";
import { store } from "@m/validator/store";

test("the library and the store load, Node first", () => {
  expect(typeof readStore).toBe("function");
  expect(store).toBeDefined();
});
