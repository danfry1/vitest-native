import { describe, expect, it } from "vitest";
import { formatGreeting, shout } from "@vn-app/greeting-service";

// Partial mocks through a tsconfig-paths-style alias, as real jest-expo suites write
// them (#174). Vite applies resolve.alias to the import above; jest.requireActual
// resolves through Node, which does not, so it used to throw "Cannot find module".
declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: any[]) => any>(impl: T): T;
  requireActual<T = any>(path: string): T;
};

jest.mock("@vn-app/greeting-service", () => ({
  ...jest.requireActual("@vn-app/greeting-service"),
  formatGreeting: jest.fn(() => "mocked"),
}));

describe("jest.requireActual with resolve.alias", () => {
  it("spreads the real module behind an aliased specifier into a partial mock", () => {
    expect(formatGreeting("Ada")).toBe("mocked");
    expect(shout("hi")).toBe("HI");
  });

  it("resolves an extensionless aliased path with the platform's extension order", () => {
    expect(jest.requireActual("@vn-app/Button").default()).toBe("ios-button");
  });

  // Node's `require` in a test file reaches the CJS resolve hook, not Vite. It
  // falls back to the same aliases once Node's own resolution fails.
  it("resolves a plain require of an aliased path", () => {
    expect(require("@vn-app/greeting-service").shout("hi")).toBe("HI");
    expect(require("@vn-app/Button").default()).toBe("ios-button");
  });
});
