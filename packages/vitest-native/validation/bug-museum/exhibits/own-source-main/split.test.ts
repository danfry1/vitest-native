// Source-aliased workspace library, no alias: the library's package.json main is src/index.ts.
import { expect, test } from "vitest";
import { store } from "@m/validator";
import { readStore } from "@m/feature";

test("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
