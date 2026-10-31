// A React Native workspace library aliased to its source with a string alias. Detection
// externalized its directory, so Node loaded the aliased source and its store while the
// test imported Vite's: two instances, silently.
import { expect, test } from "vitest";
import { store } from "@axis/validator/store";
import { readStore } from "@axis/feature";

test("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
