// Source-aliased workspace library, aliases to files (…/src/index.ts, …/store.ts).
import { expect, test } from "vitest";
import { store } from "@m/validator/store";
import { readStore } from "@m/feature";

test("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
