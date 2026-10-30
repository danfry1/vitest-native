// One of three files run on one hot worker (vitest.one-instance.config.mts, --mode hot):
// each starts from a fresh store and a fresh required reader, and shares them within the file.
import { expect, it } from "vitest";
import { state } from "./fixtures/hot-store";

it("file 2 starts fresh and shares the store with the required reader", () => {
  const read = require("./fixtures/hot-reader.cjs") as () => string | null;
  expect(state.value).toBeNull();
  expect(read()).toBeNull();
  state.value = "file 2";
  expect(read()).toBe("file 2");
});
