import { describe, it, expect, vi } from "vitest";
import { validatePeerDependency } from "../src/validate.js";
import { reactNative } from "../src/index.js";

describe("validatePeerDependency", () => {
  it("returns null when package satisfies version range", () => {
    const result = validatePeerDependency("vitest", "4.0.0", process.cwd());
    expect(result).toBeNull();
  });

  it("returns error message when package is not found", () => {
    const result = validatePeerDependency("nonexistent-pkg", "1.0.0", process.cwd());
    expect(result).toContain("not found");
  });

  it("rejects an installed package at or above the unsupported next major", () => {
    const result = validatePeerDependency("vitest", "4.0.0", process.cwd(), 4);
    expect(result).toContain("supports vitest >= 4.0.0 and < 4");
  });

  it("supports per-major security floors", () => {
    const result = validatePeerDependency("vite", "6.4.2", process.cwd(), 9, {
      6: "6.4.2",
      7: "7.3.2",
      8: "8.0.5",
    });
    expect(result).toBeNull();
  });
});

describe("engine option", () => {
  it("accepts engine: 'native' without warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reactNative({ engine: "native" });
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("Unknown option 'engine'"));
    warn.mockRestore();
  });

  it("accepts engine: 'mock' and 'auto'", () => {
    expect(() => reactNative({ engine: "mock" })).not.toThrow();
    expect(() => reactNative({ engine: "auto" })).not.toThrow();
  });
});

describe("option validation", () => {
  it("rejects invalid platform and engine values", () => {
    expect(() => reactNative({ platform: "web" } as any)).toThrow(/platform/);
    expect(() => reactNative({ engine: "device" } as any)).toThrow(/engine/);
  });

  it("rejects malformed hot runtime options", () => {
    expect(() => reactNative({ hotRuntime: null } as any)).toThrow(/hotRuntime/);
    expect(() => reactNative({ hotRuntime: { recycleAfterFiles: -1 } } as any)).toThrow(
      /non-negative/,
    );
    expect(() => reactNative({ hotRuntime: { preserveGlobals: ["valid", ""] } } as any)).toThrow(
      /non-empty strings/,
    );
    expect(() => reactNative({ hotRuntime: { unknown: true } } as any)).toThrow(
      /Unknown hotRuntime option/,
    );
  });
});
