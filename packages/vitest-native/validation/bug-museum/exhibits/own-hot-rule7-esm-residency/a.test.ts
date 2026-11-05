// File a of two in one hot worker. Both import the store before the library, the order
// #371 handles; each must see the store and class its own module graph evaluated.
import { expect, test } from "vitest";
import { store, Box } from "@m/validator/store";
import { makeBox, readStore } from "@m/feature";

test("the library builds this file's Box and reads this file's store", () => {
  expect(makeBox(1) instanceof Box, "the library's Box is this file's Box").toBe(true);
  store.value = "written by a";
  expect(readStore(), "the library reads this file's store").toBe("written by a");
});
