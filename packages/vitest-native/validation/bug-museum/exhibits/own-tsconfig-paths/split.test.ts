// Source-aliased workspace library, resolve.tsconfigPaths: true with compilerOptions.paths.
import { expect, test } from "vitest";
import { store } from "@m/validator/store";
import { readStore } from "@m/feature";

test("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
