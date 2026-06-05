import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { detectEngine } from "../src/native/detect.js";

// Anchor the "deps present" root to the package dir (where @react-native/babel-preset
// and @babel/core resolve), cwd-independent.
const HERE = path.dirname(fileURLToPath(import.meta.url));
function findUp(rel: string, start: string): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, rel))) return path.join(dir, rel);
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`${rel} not found from ${start}`);
    dir = parent;
  }
}
const PKG_DIR = path.dirname(findUp("package.json", HERE));

// A fresh temp dir with an empty package.json: a root where the native deps do NOT resolve.
let emptyRoot: string;
beforeAll(() => {
  emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-detect-"));
  fs.writeFileSync(path.join(emptyRoot, "package.json"), JSON.stringify({ name: "x", version: "0.0.0" }));
});
afterAll(() => fs.rmSync(emptyRoot, { recursive: true, force: true }));

describe("detectEngine", () => {
  it("passes through explicit engines without a notice", () => {
    expect(detectEngine("native", PKG_DIR).engine).toBe("native");
    expect(detectEngine("native", PKG_DIR).notice).toBeNull();
    expect(detectEngine("mock", PKG_DIR).engine).toBe("mock");
    expect(detectEngine("mock", PKG_DIR).notice).toBeNull();
  });

  it("auto resolves to mock today but nudges when native is available", () => {
    const d = detectEngine("auto", PKG_DIR);
    expect(d.engine).toBe("mock");
    expect(d.nativeAvailable).toBe(true);
    expect(d.notice).toContain("native engine available");
  });

  it("auto resolves to native under the future v1 policy (one-line flip is locked)", () => {
    const d = detectEngine("auto", PKG_DIR, { autoPrefersNative: true });
    expect(d.engine).toBe("native");
    expect(d.notice).toContain("auto — found @react-native/babel-preset");
  });

  it("auto resolves to mock with no notice when native deps are absent", () => {
    const d = detectEngine("auto", emptyRoot);
    expect(d.engine).toBe("mock");
    expect(d.nativeAvailable).toBe(false);
    expect(d.notice).toBeNull();
  });
});
