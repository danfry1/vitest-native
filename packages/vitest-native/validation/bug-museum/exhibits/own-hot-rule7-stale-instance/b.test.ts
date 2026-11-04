// Second file in the same hot worker: the test imports the store before the library, the
// order #371 handles (own-alias-string passes in it). A fresh file must see one store.
import { expect, test } from "vitest";
import { store } from "@m/validator/store";
import { readStore } from "@m/feature";

test("after another file, the library reads this file's store", () => {
  store.value = "written by the test";
  expect(readStore(), "the Node-owned library reads this file's store").toBe(
    "written by the test",
  );
});
