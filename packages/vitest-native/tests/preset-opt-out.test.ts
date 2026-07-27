/**
 * Turning ONE auto-detected preset off should not mean listing every other one.
 *
 * `presets` accepted only an array, and providing it replaced auto-detection
 * wholesale. A project that needed to drop the navigation preset — because it
 * renders a real NavigationContainer and the stub means `onReady` never fires — had
 * to enumerate every other detected preset by hand. That list then rots silently as
 * dependencies change: add a library, and its preset is not applied because the
 * hand-written array does not mention it.
 *
 * The object form keeps detection and names only what to drop.
 */
import { describe, expect, it } from "vitest";
import { disabledPresetNames, reactNative } from "../src/index.js";

type PluginLike = {
  configResolved: (config: { root: string }) => Promise<void>;
  config: (config: unknown, env: unknown) => Promise<{ test?: { env?: Record<string, string> } }>;
};

async function activePresets(options?: unknown): Promise<string[]> {
  const plugin = reactNative(options as never) as unknown as PluginLike;
  await plugin.configResolved({ root: process.cwd() });
  const resolved = await plugin.config({ test: {} }, { command: "serve" });
  const names = resolved?.test?.env?.VITEST_NATIVE_PRESET_NAMES;
  return names ? (JSON.parse(names) as string[]) : [];
}

describe("disabledPresetNames", () => {
  it("reads names switched off in the object form", () => {
    expect(disabledPresetNames({ navigation: false, screens: true })).toEqual(
      new Set(["navigation"]),
    );
  });

  it("treats the array form as replacing detection, not disabling", () => {
    expect(disabledPresetNames([{ name: "navigation", modules: {} }])).toEqual(new Set());
  });

  it("is empty for undefined", () => {
    expect(disabledPresetNames(undefined)).toEqual(new Set());
  });
});

describe("presets option", () => {
  it("auto-detects when omitted", async () => {
    const auto = await activePresets();
    // Guards against the assertions below passing because nothing was detected.
    expect(auto.length).toBeGreaterThan(1);
    expect(auto).toContain("navigation");
  });

  it("drops a named preset and keeps the rest", async () => {
    const auto = await activePresets();
    const without = await activePresets({ presets: { navigation: false } });
    expect(without).not.toContain("navigation");
    for (const name of auto.filter((n) => n !== "navigation")) {
      expect(without).toContain(name);
    }
  });

  it("still lets an array replace detection entirely", async () => {
    const only = await activePresets({ presets: [] });
    expect(only).toEqual([]);
  });

  it("ignores names set to true, which is the default anyway", async () => {
    const auto = await activePresets();
    expect(await activePresets({ presets: { navigation: true } })).toEqual(auto);
  });
});
