// #344's shape: an installed, Node-owned package requires a source-aliased workspace library by name.
import { expect, test } from "vitest";
import { store } from "@m/validator/store";
import { viaNode } from "museum-requires-feature";

test("an installed package's require of the aliased library reaches the same instance", () => {
  store.value = "written by the test";
  expect(viaNode(), "museum-requires-feature reads the store the test wrote").toBe(
    "written by the test",
  );
});
