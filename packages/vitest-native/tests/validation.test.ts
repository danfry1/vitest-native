import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

  // Prerelease versions previously parsed to NaN ("4.0.0-beta.3" → [4, NaN, …])
  // and failed the minimum check — a hard startup error for exactly the
  // early-adopter installs that run betas/RCs.
  describe("prerelease versions", () => {
    function withFixture(version: string, fn: (root: string) => void): void {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vn-prerelease-"));
      try {
        const pkgDir = path.join(tmp, "node_modules", "fixture-pkg");
        fs.mkdirSync(pkgDir, { recursive: true });
        fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "consumer" }));
        fs.writeFileSync(
          path.join(pkgDir, "package.json"),
          JSON.stringify({ name: "fixture-pkg", version, main: "index.js" }),
        );
        fs.writeFileSync(path.join(pkgDir, "index.js"), "module.exports = {};");
        fn(tmp);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }

    it("accepts a prerelease of a version above the minimum", () => {
      withFixture("4.1.0-beta.3", (root) => {
        expect(validatePeerDependency("fixture-pkg", "4.0.0", root)).toBeNull();
      });
    });

    it("accepts a prerelease of the minimum itself", () => {
      withFixture("4.0.0-beta.3", (root) => {
        expect(validatePeerDependency("fixture-pkg", "4.0.0", root)).toBeNull();
      });
    });

    it("still rejects a prerelease below the minimum", () => {
      withFixture("3.9.0-rc.1", (root) => {
        expect(validatePeerDependency("fixture-pkg", "4.0.0", root)).toContain("requires");
      });
    });

    it("still rejects a prerelease of the excluded next major", () => {
      withFixture("5.0.0-alpha.1", (root) => {
        expect(validatePeerDependency("fixture-pkg", "4.0.0", root, 5)).toContain("supports");
      });
    });
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
