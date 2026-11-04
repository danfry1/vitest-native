// The required file itself is mocked by the test: the mock dispatcher serves Node's require
// the test's mock, and the real module does not take the mock's place.
import { expect, test, vi } from "vitest";
import { store } from "@m/validator/store";
import { requireStore } from "@m/feature";

vi.mock("@m/validator/store", () => ({ store: { value: "mock" } }));

test("a require of a module the test mocks gets the mock, and it stays the mock", async () => {
  expect(requireStore().store).toBe(store);
  expect(store.value).toBe("mock");
  expect((await import("@m/validator/store")).store.value).toBe("mock");
});
