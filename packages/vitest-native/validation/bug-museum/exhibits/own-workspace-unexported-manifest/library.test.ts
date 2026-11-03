// The library runs in Vite, as it did in 0.14.0-rc.10: its setup file, its vitest helper
// and a vi.mock of one of its modules all behave as they do for project source.
import { expect, test } from "vitest";
import { store, welcome } from "@m/kit";

test("the setup file wrote to the store the test imports", () => {
  expect(store.value, "kit store written by the setup file").toBe("from-setup");
});

test("the library's vitest helper loaded", () => {
  expect(typeof (globalThis as { __fakeFetch?: unknown }).__fakeFetch, "kit vitest helper").toBe(
    "function",
  );
});

test("vi.mock in the setup file reaches the library's own import", () => {
  expect(welcome(), "kit internal import mocked").toBe("setup-mocked");
});
