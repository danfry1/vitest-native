/**
 * Which auto-detected presets each engine applies. The native engine runs a package's
 * own JavaScript and substitutes only its native module, so presets that replace
 * packages it can run as themselves (NATIVE_ENGINE_RUNS_PACKAGES) step aside there,
 * unless the `presets` option turns one on.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { activePresets } from "../src/cli/manifest.js";
import { autoDetectedPresetApplies, NATIVE_ENGINE_RUNS_PACKAGES } from "../src/preset-map.js";

describe("autoDetectedPresetApplies", () => {
  it("steps the expo and worklets presets aside under the native engine only", () => {
    expect(NATIVE_ENGINE_RUNS_PACKAGES).toEqual(["expo", "worklets"]);
    // This package installs react-native-worklets 0.13, which ships its Jest resolver.
    const root = path.resolve(import.meta.dirname, "..");
    for (const preset of ["expo", "worklets"]) {
      expect(autoDetectedPresetApplies(preset, "native", undefined, root)).toBe(false);
      expect(autoDetectedPresetApplies(preset, "mock", undefined, root)).toBe(true);
    }
    // Reanimated's applies, with reanimated's own mock as its module there.
    expect(autoDetectedPresetApplies("reanimated", "native", undefined, root)).toBe(true);
  });

  it("keeps the worklets preset where the installed worklets has no Jest resolver", () => {
    // Before worklets 0.9 its `.native` initializers load and throw without one.
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "vn-no-resolver-"));
    try {
      fs.writeFileSync(path.join(bare, "package.json"), "{}");
      expect(autoDetectedPresetApplies("worklets", "native", undefined, bare)).toBe(true);
      expect(autoDetectedPresetApplies("worklets", "native")).toBe(true);
      expect(autoDetectedPresetApplies("expo", "native", undefined, bare)).toBe(false);
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });

  it("applies it under the native engine when the option turns it on", () => {
    expect(autoDetectedPresetApplies("expo", "native", { expo: true })).toBe(true);
    expect(autoDetectedPresetApplies("expo", "native", { expo: false })).toBe(false);
    expect(autoDetectedPresetApplies("expo", "native", { navigation: false })).toBe(false);
  });
});

describe("the CLI's view of the active presets", () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  });

  it("matches the engine's rule", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-preset-engine-"));
    roots.push(root);
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    const pkg = path.join(root, "node_modules", "expo-constants");
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ version: "58.0.0" }));
    expect(activePresets(root, [], "native")).not.toContain("expo");
    expect(activePresets(root, [], "mock")).toContain("expo");
  });
});
