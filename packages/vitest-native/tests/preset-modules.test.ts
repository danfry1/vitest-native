/**
 * Presets of the project's own are listed as module paths (`presets: ['./path']`):
 * a preset object's factories are functions, which cannot reach the test workers.
 * The end-to-end run, under both engines, is tests-native/custom-preset/.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { reactNative, splitPresets } from "../src/plugin.js";
import { presets } from "../src/index.js";
import { presetFromModule } from "../src/preset-modules.mjs";
import { runPluginConfig } from "./plugin-config.js";

function project(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-preset-modules-"));
  for (const [file, source] of Object.entries(files))
    fs.writeFileSync(path.join(root, file), source);
  return root;
}

const PRESET_SOURCE = `export default () => ({
  name: "mine",
  modules: { "my-lib": { exports: ["thing"], factory: () => ({ thing: 1 }) } },
});`;

describe("splitPresets", () => {
  it("keeps vitest-native's presets and resolves module paths from the root", () => {
    const root = project({ "my-preset.ts": PRESET_SOURCE });
    const reanimated = presets.reanimated();
    expect(splitPresets([reanimated, "./my-preset.ts"], root)).toEqual({
      builtIn: [reanimated],
      modulePaths: [path.join(root, "my-preset.ts")],
    });
  });

  it("refuses a preset object of the project's own, naming the module form", () => {
    const mine = { name: "mine", modules: {} };
    expect(() => splitPresets([mine], os.tmpdir())).toThrow(
      /The preset 'mine' is not one of vitest-native's[\s\S]*presets: \['\.\/test\/presets\/mine\.ts'\]/,
    );
  });

  it("refuses an entry that is neither", () => {
    expect(() => splitPresets([42 as never], os.tmpdir())).toThrow(
      /Each entry of "presets" must be a preset[\s\S]*received 42/,
    );
  });

  it("names a module path that does not exist", () => {
    const root = project({});
    expect(() => splitPresets(["./missing.ts"], root)).toThrow(
      /The preset module '\.\/missing\.ts' does not exist/,
    );
  });
});

describe("presetFromModule", () => {
  const module = { "my-lib": { exports: ["thing"], factory: () => ({}) } };

  it("takes a default-exported preset or a function returning one", () => {
    expect(presetFromModule({ default: { name: "a", modules: module } }, "a.ts").name).toBe("a");
    expect(presetFromModule({ default: () => ({ name: "b", modules: module }) }, "b.ts").name).toBe(
      "b",
    );
  });

  it("names the module whose export is not a preset", () => {
    expect(() => presetFromModule({ default: 1 }, "/p/x.ts")).toThrow(
      /The preset module \/p\/x\.ts must default-export a preset/,
    );
    expect(() =>
      presetFromModule({ default: { name: "c", modules: { lib: { exports: [] } } } }, "/p/y.ts"),
    ).toThrow(/declares 'lib' without a factory function and an exports array/);
  });
});

describe("the plugin with a preset module", () => {
  it("reads its export names at config time, from a module that imports react-native", async () => {
    const root = project({
      "my-preset.ts": `import { View } from "react-native";\n${PRESET_SOURCE}\nexport const view = View;`,
    });
    const file = path.join(root, "my-preset.ts");
    const plugin2 = reactNative({ engine: "mock", presets: [file] }) as any;
    const result = await runPluginConfig(plugin2, { root: process.cwd() });
    expect(JSON.parse(result.test.env.VITEST_NATIVE_PRESET_MODULES)).toEqual([file]);
    await plugin2.configResolved({ root: process.cwd() });
    const id = plugin2.resolveId("my-lib", undefined);
    expect(id).toBe("\0virtual:preset:my-lib");
    expect(plugin2.load(id)).toContain("export const thing = _m['thing'];");
  });

  it("refuses two presets of one name", async () => {
    const root = project({ "a.ts": PRESET_SOURCE, "b.ts": PRESET_SOURCE });
    const plugin = reactNative({
      engine: "mock",
      presets: [path.join(root, "a.ts"), path.join(root, "b.ts")],
    }) as any;
    await runPluginConfig(plugin, { root: process.cwd() });
    await expect(plugin.configResolved({ root: process.cwd() })).rejects.toThrow(
      /Two presets are named 'mine'/,
    );
  });
});
