/**
 * A factory whose importOriginal() loads an ES module package whose files import its
 * entry back: while the factory runs, that import is the real entry (R1).
 */
import { expect, it, vi } from "vitest";
import * as lib from "dispatch-cycle-lib";

vi.mock("dispatch-cycle-lib", async (importOriginal) => ({
  ...(await importOriginal<typeof import("dispatch-cycle-lib")>()),
  fn: () => "mock fn",
}));

it("builds the partial mock through the cycle", () => {
  expect(lib.fn()).toBe("mock fn");
  expect(lib.helper()).toBe("function");
});
