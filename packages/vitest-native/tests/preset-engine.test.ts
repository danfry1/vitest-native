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
  it("steps the expo, gesture-handler and flash-list presets aside under the native engine only", () => {
    expect(NATIVE_ENGINE_RUNS_PACKAGES).toEqual(["expo", "gestureHandler", "flashList"]);
    for (const preset of NATIVE_ENGINE_RUNS_PACKAGES) {
      expect(autoDetectedPresetApplies(preset, "native")).toBe(false);
      expect(autoDetectedPresetApplies(preset, "mock")).toBe(true);
    }
    // These apply, with the library's own mock as their module there.
    for (const preset of ["reanimated", "worklets", "safeAreaContext"]) {
      expect(autoDetectedPresetApplies(preset, "native")).toBe(true);
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
