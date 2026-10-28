// Source-aliased workspace library, a single regex alias for all packages (^@m/([^/]+)/(.*)$).
import { expect, test } from "vitest";
import { store } from "@m/validator/store";
import { readStore } from "@m/feature/index";

test("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
