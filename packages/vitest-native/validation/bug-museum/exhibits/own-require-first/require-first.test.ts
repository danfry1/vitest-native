// Node-owned code loads a project file BEFORE the test imports it: the test's first import
// is the React Native workspace library (Node evaluates it, and it requires the store),
// and only then does the test import the store itself.
import { expect, test } from "vitest";
import { readStore } from "@m/feature";
import { store } from "@m/validator/store";

test("a store a Node-owned library loaded first is the store the test imports", () => {
  store.value = "written by the test";
  expect(readStore(), "one store instance, whichever side loaded it first").toBe(
    "written by the test",
  );
});
