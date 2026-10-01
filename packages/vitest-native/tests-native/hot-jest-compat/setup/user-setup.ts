// A migrated suite's jest.setup.js, in the shape real projects write: module mocks,
// a custom matcher, a global and a console spy, all applied
// at the top level for every test file. Vitest runs it before each file, after the hot
// runtime's reset, so each file must see each of these applied exactly once — present,
// not stacked on the previous file's, not left over from it.
import { expect } from "vitest";

declare const jest: typeof import("vitest").vi;

jest.mock("../fixtures/setup-mocked", () => ({ source: () => "mocked-by-setup" }));
jest.mock("rn-ecosystem-lib", () => ({ Banner: () => null, mockedBySetup: true }));

expect.extend({
  toBeTheSetupMatcher(received: unknown) {
    return {
      pass: received === "setup",
      message: () => `expected ${String(received)} to be "setup"`,
    };
  },
});

const g = globalThis as Record<string, unknown>;
g.__vnSetupRuns = ((g.__vnSetupRuns as number | undefined) ?? 0) + 1;

jest.spyOn(console, "warn").mockImplementation(() => {});
// No jest.setTimeout here, although real setups often have one: it would mask the
// gate's check that a timeout shortened by a previous file does not carry over.
