// Library code that feature-detects reportError, as browser-oriented libraries do.
import { expect, test, vi } from "vitest";

function reportHandled(error: Error) {
  const report = (globalThis as { reportError?: (e: unknown) => void }).reportError;
  if (typeof report === "function") report(error);
  else console.error(error);
}

test("a handled error reported through feature detection does not fail the run", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  reportHandled(new Error("handled by the library"));
  spy.mockRestore();
  expect(true).toBe(true);
});
