// A required module imports a Node builtin the test mocks: it gets the test's mock, as
// the same module imported by the test does.
import { expect, test, vi } from "vitest";
import { requireUsesSep } from "@m/feature";

vi.mock("node:path", () => ({ sep: "MOCK-SEP", default: { sep: "MOCK-SEP" } }));

test("a required module's mocked builtin is the test's mock", async () => {
  expect(requireUsesSep().seen, "the mocked builtin").toBe("MOCK-SEP");
  expect((await import("@m/validator/uses-sep")).seen).toBe("MOCK-SEP");
});
