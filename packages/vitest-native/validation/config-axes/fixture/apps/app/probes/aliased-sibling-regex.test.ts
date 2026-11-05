// The string-alias probe's twin through regex aliases, which Node's alias fallback
// cannot represent: "Cannot find module" once the library is externalized.
import { expect, test } from "vitest";
import { store } from "@axis/rvalidator/store";
import { readStore } from "@axis/rfeature/index";

test("a store written through one import path reads back through the other", () => {
  store.value = "written by the test";
  expect(readStore()).toBe("written by the test");
});
