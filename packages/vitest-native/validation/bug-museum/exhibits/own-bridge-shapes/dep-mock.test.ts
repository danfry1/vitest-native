// A required module imports a file the test mocks. Serving the mock from the bridge is
// the mock dispatcher's (not wired in yet), so the require fails by name instead of
// handing the module the real file.
import { expect, test, vi } from "vitest";
import { requireStore } from "@m/feature";

vi.mock("@m/validator/helper", () => ({ label: "mocked-helper" }));

test("a required module whose import is mocked fails by name", () => {
  expect(() => requireStore()).toThrow(expect.objectContaining({ code: "REQUIRE_REACHED_MOCK" }));
});
