// Source-aliased workspace library, one parent alias (@m -> packages/).
import { expect, test } from "vitest";
import { store } from "@m/validator/src/store";
import { readStore } from "@m/feature/src/index";

test("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
