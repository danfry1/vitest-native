import { test } from "vitest";
import { assertCleanThenPollute } from "./bleedSurfaces.js";

test("resident surfaces are clean at file start (file 2)", () => {
  assertCleanThenPollute();
});
