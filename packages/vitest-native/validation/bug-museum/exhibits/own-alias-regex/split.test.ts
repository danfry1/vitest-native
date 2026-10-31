// Source-aliased workspace library, one regex alias per package (the shape Jest's moduleNameMapper migrates to).
import { expect, test } from "vitest";
import { store } from "@m/validator/store";
import { readStore } from "@m/feature/index";

test("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
