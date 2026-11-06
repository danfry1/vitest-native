// A file that does not touch the workspace library: its per-file load count is the
// baseline the gate compares the files that do touch it against.
import { expect, test } from "vitest";
import { count, record } from "resident-singleton";
import { store } from "@m/validator/store";

test("a file without the workspace library", () => {
  expect(store.value).toBe(null);
  expect(count()).toBe(0);
  record("c");
});
