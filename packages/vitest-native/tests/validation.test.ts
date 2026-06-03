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
