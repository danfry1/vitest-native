import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { detectEngine } from "../src/native/detect.js";
import { resolveTransformPreset } from "../src/native/babel-preset.mjs";

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

// Expo from SDK 56: babel-preset-expo no longer depends on @react-native/babel-preset,
// so a project from an SDK 56+ template has only Expo's preset (expo/internal/babel-preset,
// nested babel-preset-expo as npm installs it). Stubs suffice: nothing is loaded.
function project(packages: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-detect-preset-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "p", private: true }));
  for (const [rel, version] of Object.entries(packages)) {
    const dir = path.join(root, rel);
    fs.mkdirSync(dir, { recursive: true });
    const name = rel.split("node_modules/").pop()!;
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name, version, main: "index.js" }),
    );
    fs.writeFileSync(path.join(dir, "index.js"), "module.exports = {};");
  }
  return root;
}
function withExpoPreset(root: string): string {
  const internal = path.join(root, "node_modules", "expo", "internal");
  fs.mkdirSync(internal, { recursive: true });
  fs.writeFileSync(
    path.join(internal, "babel-preset.js"),
    "module.exports = require('babel-preset-expo');",
  );
  return root;
}

describe("the React Native Babel preset", () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  });
  const make = (packages: Record<string, string>, expoPreset = false) => {
    const root = project(packages);
    roots.push(root);
    return expoPreset ? withExpoPreset(root) : root;
  };

  it("uses Expo's preset in an Expo SDK 58 project, which has no React Native preset", () => {
    const root = make(
      {
        "node_modules/react-native": "0.88.0",
        "node_modules/@babel/core": "7.29.7",
        "node_modules/expo": "58.0.19",
        "node_modules/expo/node_modules/babel-preset-expo": "58.0.20",
      },
      true,
    );
    const d = detectEngine("auto", root);
    expect(d.engine).toBe("native");
    expect(d.missing).toEqual([]);
    const preset = resolveTransformPreset(root)!;
    expect(preset.name).toBe("babel-preset-expo");
    expect(preset.version).toBe("58.0.20");
    expect(preset.file).toBe(
      fs.realpathSync(path.join(root, "node_modules", "expo", "internal", "babel-preset.js")),
    );
  });

  it("keeps the React Native preset where it resolves, Expo or not", () => {
    const root = make(
      {
        "node_modules/react-native": "0.86.3",
        "node_modules/@babel/core": "7.29.7",
        "node_modules/@react-native/babel-preset": "0.86.3",
        "node_modules/expo": "57.0.24",
        "node_modules/babel-preset-expo": "57.0.10",
      },
      true,
    );
    expect(resolveTransformPreset(root)!.name).toBe("@react-native/babel-preset");
    expect(resolveTransformPreset(root)!.version).toBe("0.86.3");
  });

  it("reports the React Native preset missing when neither preset resolves", () => {
    const root = make({
      "node_modules/react-native": "0.88.0",
      "node_modules/@babel/core": "7.29.7",
      "node_modules/expo": "58.0.19",
    });
    expect(resolveTransformPreset(root)).toBeNull();
    const d = detectEngine("auto", root);
    expect(d.engine).toBe("mock");
    expect(d.missing).toEqual(["@react-native/babel-preset"]);
  });
});
