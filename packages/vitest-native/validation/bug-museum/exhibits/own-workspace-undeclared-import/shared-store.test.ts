// The app imports a workspace library, and so does a React Native workspace package's
// source, which Node loads. The package imports the library without declaring it.
import { expect, it } from "vitest";
import { readLabel, readStore } from "@m/feature";
import { store } from "@m/lib";

it("the app and the sibling package share the library's store", () => {
  store.value = "written by the test";
  expect(readStore(), "one store").toBe("written by the test");
  expect(readLabel(), "one store, through a module it re-exports").toBe(
    "value: written by the test",
  );
});
