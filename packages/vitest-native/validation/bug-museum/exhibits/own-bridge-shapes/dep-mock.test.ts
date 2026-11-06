// A required module imports a file the test mocks: the mock dispatcher serves it, so the
// module the bridge evaluates gets the test's own instance of the mock.
import { expect, test, vi } from "vitest";
import * as helper from "@m/validator/helper";
import { requireStore } from "@m/feature";

vi.mock("@m/validator/helper", () => ({ label: "mocked-helper", marker: {} }));

test("a required module's mocked import is the test's own mock", () => {
  const { store } = requireStore();
  expect(store.tag, "the mock's label").toMatch(/^mocked-helper/);
  // Evaluated once, by the bridge, with the mock: the real helper never ran.
  expect((globalThis as { __evals?: Record<string, number> }).__evals?.helper).toBeUndefined();
  expect((helper as { marker?: object }).marker).toBeDefined();
});
