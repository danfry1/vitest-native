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
  fs.writeFileSync(
    path.join(emptyRoot, "package.json"),
    JSON.stringify({ name: "x", version: "0.0.0" }),
  );
});
afterAll(() => fs.rmSync(emptyRoot, { recursive: true, force: true }));

describe("detectEngine", () => {
  it("passes through explicit engines without a notice", () => {
    expect(detectEngine("native", PKG_DIR).engine).toBe("native");
    expect(detectEngine("native", PKG_DIR).notice).toBeNull();
    expect(detectEngine("mock", PKG_DIR).engine).toBe("mock");
    expect(detectEngine("mock", PKG_DIR).notice).toBeNull();
  });

  it("auto resolves to native, silently, when native deps are available (default)", () => {
    const d = detectEngine("auto", PKG_DIR);
    expect(d.engine).toBe("native");
    expect(d.nativeAvailable).toBe(true);
    expect(d.notice).toBeNull();
  });

  it("auto falls back to mock with an explanatory notice when native deps are absent", () => {
    const d = detectEngine("auto", emptyRoot);
    expect(d.engine).toBe("mock");
    expect(d.nativeAvailable).toBe(false);
    expect(d.notice).toContain("react-native, @react-native/babel-preset, @babel/core not found");
  });

  it("auto falls back to mock when the Babel toolchain resolves but react-native does not", () => {
    // The shape that used to choose native and explode later at RN resolution:
    // a root where the preset and @babel/core resolve (stubs suffice — detection
    // only resolves, never loads) but react-native itself is absent.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-detect-babelonly-"));
    try {
      fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ name: "b", private: true }),
      );
      for (const pkg of ["@react-native/babel-preset", "@babel/core"]) {
        const dir = path.join(root, "node_modules", ...pkg.split("/"));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "package.json"),
          JSON.stringify({ name: pkg, version: "0.0.1", main: "index.js" }),
        );
        fs.writeFileSync(path.join(dir, "index.js"), "module.exports = {};");
      }
      const d = detectEngine("auto", root);
      expect(d.engine).toBe("mock");
      expect(d.nativeAvailable).toBe(false);
      expect(d.notice).toContain("react-native not found");
      expect(d.notice).not.toContain("@babel/core not found");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("autoPrefersNative:false override resolves auto to mock with no notice", () => {
    const d = detectEngine("auto", PKG_DIR, { autoPrefersNative: false });
    expect(d.engine).toBe("mock");
    expect(d.nativeAvailable).toBe(true);
    expect(d.notice).toBeNull();
  });
});
