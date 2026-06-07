import { describe, expect, it } from "vitest";

// Migrated Jest suites often do `jest.requireActual('./app/X')` to spread a real
// module then override one export. Node's CJS loader can't load .ts/.tsx, so the
// native engine registers Babel-backed .ts/.tsx require handlers. Path is relative
// to the project root (where jest-compat's global require is anchored).
declare const jest: { requireActual(m: string): any };

describe("native engine: jest.requireActual of app TS/TSX", () => {
  it("loads a real .tsx module synchronously (TS + default export)", () => {
    const mod = jest.requireActual("./tests-native/fixtures/widget");
    expect(typeof mod.default).toBe("function");
    expect(mod.default()).toBe("real-widget");
  });
});
