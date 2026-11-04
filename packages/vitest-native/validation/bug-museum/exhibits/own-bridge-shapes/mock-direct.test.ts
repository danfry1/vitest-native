// The required file itself is mocked by the test: the bridge steps aside (serving the mock
// to Node is the mock dispatcher's), and the real module does not take the mock's place.
import { expect, test, vi } from "vitest";
import { store } from "@m/validator/store";
import { requireStore } from "@m/feature";

vi.mock("@m/validator/store", () => ({ store: { value: "mock" } }));

test("a require of a module the test mocks does not replace the mock", async () => {
  requireStore();
  expect(store.value).toBe("mock");
  expect((await import("@m/validator/store")).store.value).toBe("mock");
});
