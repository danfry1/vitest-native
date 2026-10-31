// Source-aliased workspace library, one root alias (~ -> the workspace root).
import { expect, test } from "vitest";
import { store } from "~/packages/validator/src/store";
import { readStore } from "~/packages/feature/src/index";

test("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
