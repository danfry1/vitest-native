/**
 * Presets of the project's own are listed as module paths (`presets: ['./path']`, or
 * `presets: { './path': true }` beside auto-detection): a preset object's factories
 * are functions, which cannot reach the test workers.
 * The end-to-end run, under both engines, is tests-native/custom-preset/.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { reactNative, selectPresets } from "../src/plugin.js";
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

describe("selectPresets", () => {
  it("keeps vitest-native's presets and resolves module paths from the root", () => {
    const root = project({ "my-preset.ts": PRESET_SOURCE });
    const reanimated = presets.reanimated();
    expect(selectPresets([reanimated, "./my-preset.ts"], root)).toEqual({
      listed: [reanimated],
      modulePaths: [path.join(root, "my-preset.ts")],
    });
  });

  it("accepts every preset vitest-native exports", () => {
    // A factory that does not mark its preset would be refused as a copy.
    for (const [name, factory] of Object.entries(presets)) {
      const preset = (factory as () => Parameters<typeof selectPresets>[0][number])();
      expect(selectPresets([preset], os.tmpdir()).listed, name).toEqual([preset]);
    }
  });

  it("adds a module path beside auto-detection in the object form", () => {
    const root = project({ "my-preset.ts": PRESET_SOURCE });
    expect(
      selectPresets({ navigation: false, reanimated: true, "./my-preset.ts": true }, root),
    ).toEqual({ listed: null, modulePaths: [path.join(root, "my-preset.ts")] });
  });

  it("refuses a preset object of the project's own, naming the module form", () => {
    const mine = { name: "mine", modules: {} };
    expect(() => selectPresets([mine as never], os.tmpdir())).toThrow(
      /The preset 'mine' is not one of vitest-native's[\s\S]*presets: \['\.\/test\/presets\/mine\.ts'\]/,
    );
  });

  it("refuses a built-in preset copied, extended or impersonated", () => {
    const navigation = presets.navigation();
    const extended = {
      ...navigation,
      modules: { ...navigation.modules, "my-lib": { exports: [], factory: () => ({}) } },
    };
    const impersonated = { name: "navigation", modules: {} };
    for (const entry of [{ ...navigation }, extended, impersonated]) {
      expect(() => selectPresets([entry], os.tmpdir())).toThrow(
        /This 'navigation' preset is not the one presets\.navigation\(\) returns/,
      );
    }
    navigation.modules["my-lib"] = { exports: [], factory: () => ({}) };
    expect(() => selectPresets([navigation], os.tmpdir())).toThrow(/modules were added/);
  });

  it("does not take an inherited property's name for a preset's", () => {
    expect(() =>
      selectPresets([{ name: "constructor", modules: {} } as never], os.tmpdir()),
    ).toThrow(/The preset 'constructor' is not one of vitest-native's/);
  });

  it("says to call a preset factory listed uncalled", () => {
    expect(() => selectPresets([presets.reanimated as never], os.tmpdir())).toThrow(
      /is the preset factory reanimated itself; call it: presets\.reanimated\(\)/,
    );
  });

  it("refuses an entry that is neither", () => {
    expect(() => selectPresets([42 as never], os.tmpdir())).toThrow(
      /Each entry of "presets" must be a preset[\s\S]*received 42/,
    );
  });

  it("names a module path that does not exist", () => {
    const root = project({});
    expect(() => selectPresets(["./missing.ts"], root)).toThrow(
      /The preset module '\.\/missing\.ts' does not exist/,
    );
  });

  it("names vitest-native's presets when a name resolves to neither", () => {
    expect(() => selectPresets({ reanimted: true }, project({}))).toThrow(
      /'reanimted' does not resolve[\s\S]*presets are named reanimated, /,
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

  it("refuses export names a generated module could not declare", () => {
    for (const name of ["default", "delete", "my-thing", 1]) {
      const modules = { lib: { exports: [name], factory: () => ({}) } };
      expect(
        () => presetFromModule({ default: { name: "d", modules } }, "/p/z.ts"),
        String(name),
      ).toThrow(/lists .* among the exports of 'lib'/);
    }
  });

  it("says why an async default export is refused", () => {
    expect(() =>
      presetFromModule({ default: async () => ({ name: "e", modules: module }) }, "/p/e.ts"),
    ).toThrow(/default-exports an async function[\s\S]*prepare\(\)/);
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
      /Two preset modules' presets are named 'mine'/,
    );
  });

  it("refuses a preset module named after one of vitest-native's presets", async () => {
    const root = project({ "a.ts": PRESET_SOURCE.replace('"mine"', '"reanimated"') });
    const plugin = reactNative({ engine: "mock", presets: [path.join(root, "a.ts")] }) as any;
    await runPluginConfig(plugin, { root: process.cwd() });
    await expect(plugin.configResolved({ root: process.cwd() })).rejects.toThrow(
      /is named 'reanimated', which is one of vitest-native's presets/,
    );
  });

  it("names the module, and what to move into its factories, when it cannot be imported", async () => {
    const root = project({
      "cjs.cjs": "module.exports = { name: 'c', modules: {} };",
      "throws.ts": `throw new Error("boom");\n${PRESET_SOURCE}`,
    });
    for (const [file, cause] of [
      ["cjs.cjs", /module is not defined/],
      ["throws.ts", /boom/],
    ] as const) {
      const plugin = reactNative({ engine: "mock", presets: [path.join(root, file)] }) as any;
      await runPluginConfig(plugin, { root: process.cwd() });
      const error = await plugin.configResolved({ root: process.cwd() }).catch((e: Error) => e);
      expect(error.message).toMatch(cause);
      expect(error.message).toMatch(
        new RegExp(
          `The preset module .*${file} could not be imported[\\s\\S]*inside its factories`,
        ),
      );
    }
  });
});
