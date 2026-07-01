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

  // Real Jest suites clone-and-override RN: `const RN = jest.requireActual(
  // 'react-native'); RN.Platform = {...}; return RN`. RN's index is a facade of
  // lazy getters with no setters, so the assignment must not throw, the override
  // must win on later reads, and un-overridden exports must still resolve.
  it("returns a writable react-native facade (clone-and-override pattern)", () => {
    const RN = jest.requireActual("react-native");
    expect(() => {
      RN.Platform = { OS: "ios", select: (o: any) => o.ios };
    }).not.toThrow();
    expect(RN.Platform.OS).toBe("ios");
    expect(RN.Platform.select({ ios: 1, android: 2 })).toBe(1);
    // Un-overridden exports still resolve through the real (lazy) facade.
    expect(typeof RN.StyleSheet.create).toBe("function");
  });
});
