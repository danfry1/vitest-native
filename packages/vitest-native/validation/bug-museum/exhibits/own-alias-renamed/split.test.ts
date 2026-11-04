// Source-aliased workspace library under an alias named differently from the package (#344's shape).
import { expect, test } from "vitest";
import { store } from "@m/validator/store";
import { readStore } from "@feat";

test("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
