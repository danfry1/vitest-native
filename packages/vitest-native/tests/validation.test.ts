import { describe, it, expect } from "vitest";
import { validatePeerDependency } from "../src/validate.js";

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
