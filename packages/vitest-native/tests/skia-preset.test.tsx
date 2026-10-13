/**
 * The skia preset under the mock engine, zero-config: Skia is a devDependency under
 * both its names (`react-native-skia` 3.x, `@shopify/react-native-skia` 2.14), so the
 * preset is auto-detected. Its module needs CanvasKit, which loads asynchronously;
 * the mock engine's second setup file (preset-ready.mjs) awaits it before any user
 * setup file or test file loads. The native engine's coverage is
 * tests-native/skia.test.tsx.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react-native";
import * as skia2 from "@shopify/react-native-skia";
import { Canvas, Circle, Skia, matchFont, useFont } from "@shopify/react-native-skia";
import * as skia3 from "react-native-skia";
import { reactNative } from "../src/index.js";
import { AUTO_DETECT_PRESETS, PRESET_MODULES } from "../src/preset-map.js";
import * as presets from "../src/presets/index.js";
import { esmExportNames } from "../src/presets/esm-export-names.js";
import { skia } from "../src/presets/skia.js";
import { runPluginConfig } from "./plugin-config.js";

const SKIA = "@shopify/react-native-skia";
const SKIA_PACKAGES = ["react-native-skia", "@shopify/react-native-skia"];

/** The names the installed package's ESM build exports, read independently. */
function installedNames(name: string): string[] {
  const dir = path.dirname(createRequire(import.meta.url).resolve(`${name}/package.json`));
  return esmExportNames(path.join(dir, "lib/module/index.js"));
}

/** A project with only a stand-in for Skia 2.14 under its Shopify name installed. */
function shopifyOnlyProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-skia-only-shopify-"));
  const dir = path.join(root, "node_modules", SKIA);
  fs.mkdirSync(path.join(dir, "lib/module"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"app"}');
  fs.writeFileSync(path.join(dir, "package.json"), `{"name":"${SKIA}","version":"2.14.0"}`);
  fs.writeFileSync(
    path.join(dir, "lib/module/index.js"),
    'export { Canvas } from "./canvas"; export const Skia = {};',
  );
  fs.writeFileSync(path.join(dir, "lib/module/canvas.js"), "export const Canvas = 1;");
  return root;
}

describe("skia preset: wiring", () => {
  it("is auto-detected for both of Skia's names and can shadow exactly them", () => {
    for (const name of SKIA_PACKAGES) expect(AUTO_DETECT_PRESETS[name]).toBe("skia");
    expect(Object.keys(skia().modules)).toEqual(SKIA_PACKAGES);
    expect([...PRESET_MODULES.skia]).toEqual(SKIA_PACKAGES);
  });

  it("imports exactly each installed version's exports, each of which its mock provides", () => {
    for (const [name, ns] of [
      ["react-native-skia", skia3],
      [SKIA, skia2],
    ] as const) {
      const names = Object.keys(ns).filter((n) => n !== "default");
      expect(names.sort(), name).toEqual(installedNames(name));
      const values = ns as Record<string, unknown>;
      expect(
        names.filter((n) => values[n] === undefined),
        name,
      ).toEqual([]);
    }
    // 2.15.0 added SkiaGraphiteView, so a list read from one version is wrong for the other.
    expect("SkiaGraphiteView" in skia3).toBe(true);
    expect("SkiaGraphiteView" in skia2).toBe(false);
  });

  it("builds its module before user setup files run", () => {
    expect((globalThis as any).__vnSkiaMockAtUserSetup).toBe(true);
  });

  it("reads the names from the project root, and shadows only the name installed there", async () => {
    // This repository, the working directory, has both names installed; the project
    // has only the Shopify one, whose stand-in exports two names.
    const root = shopifyOnlyProject();
    // The plugin's required peers, linked from this repository's install.
    for (const peer of ["vitest", "vite", "react"]) {
      const target = path.dirname(createRequire(import.meta.url).resolve(`${peer}/package.json`));
      fs.symlinkSync(target, path.join(root, "node_modules", peer), "junction");
    }
    const plugin = reactNative({ engine: "mock", presets: [skia()] }) as any;
    await runPluginConfig(plugin, { root }, { command: "serve", mode: "test" });
    await plugin.configResolved({ root });
    const id = plugin.resolveId(SKIA, undefined);
    expect(id).toBe(`\0virtual:preset:${SKIA}`);
    const code: string = plugin.load(id);
    expect(code.match(/export const \w+/g)).toEqual(["export const Canvas", "export const Skia"]);
    expect(plugin.resolveId("react-native-skia", undefined)).toBeUndefined();
  });

  it("refuses to be listed by hand where no Skia resolves, rather than shadow nothing", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-skia-absent-"));
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"app"}');
    fs.mkdirSync(path.join(root, "node_modules"));
    for (const peer of ["vitest", "vite", "react"]) {
      const target = path.dirname(createRequire(import.meta.url).resolve(`${peer}/package.json`));
      fs.symlinkSync(target, path.join(root, "node_modules", peer), "junction");
    }
    const plugin = reactNative({ engine: "mock", presets: [skia()] }) as any;
    await runPluginConfig(plugin, { root }, { command: "serve", mode: "test" });
    await expect(plugin.configResolved({ root })).rejects.toThrow(
      /The skia preset is listed in `presets`, and none of its packages \(react-native-skia, @shopify\/react-native-skia\) resolves/,
    );
  });

  it("passes each project's export names to its workers, and refuses a VM pool", async () => {
    const root = process.cwd();
    const plugin = reactNative({ engine: "mock" }) as any;
    const result = await runPluginConfig(plugin, { root }, { command: "serve", mode: "test" });
    await plugin.configResolved({ root });
    const setupFiles = result.test.setupFiles;
    const project = (pool?: string) => ({
      config: { root, pool, setupFiles, env: {} as Record<string, string> },
    });
    const vitest = { config: { cliOptions: {} } };
    const threads = project("threads");
    plugin.configureVitest({ vitest, project: threads });
    const passed = JSON.parse(threads.config.env.VITEST_NATIVE_PRESET_EXPORTS);
    expect(passed["react-native-skia"]).toEqual(installedNames("react-native-skia"));
    expect(passed[SKIA]).toEqual(installedNames(SKIA));
    expect(() => plugin.configureVitest({ vitest, project: project("vmThreads") })).toThrow(
      /The skia preset cannot run on the 'vmThreads' pool[\s\S]*presets: \{ skia: false \}/,
    );
  });

  it("runs its setup and the preparation it awaits before the user's setup files", async () => {
    const userConfig = { root: process.cwd(), test: { setupFiles: ["./user-setup.ts"] } };
    await runPluginConfig(reactNative({ engine: "mock" }) as any, userConfig, {
      command: "serve",
      mode: "test",
    });
    expect(userConfig.test.setupFiles.map((f) => path.basename(f))).toEqual([
      "setup.ts",
      "preset-ready.mjs",
      "user-setup.ts",
    ]);
  });

  it("keeps every preset's export names within one Windows environment variable", () => {
    // The plugin passes them to workers as VITEST_NATIVE_PRESET_EXPORTS, and Windows
    // caps a variable at 32,767 characters. Every preset active is the worst case.
    const all: Record<string, string[] | null> = {};
    for (const factory of Object.values(presets)) {
      for (const [name, module] of Object.entries(factory().modules)) {
        all[name] = module.exportsFor
          ? module.exportsFor({ projectRoot: process.cwd(), platform: "ios" })
          : module.exports;
      }
    }
    expect(JSON.stringify(all).length).toBeLessThan(24_000);
  });

  it("says what to do when it cannot read the installed version's exports", () => {
    const root = shopifyOnlyProject();
    fs.writeFileSync(
      path.join(root, "node_modules", SKIA, "lib/module/index.js"),
      'export * from "./moved";',
    );
    expect(() => skia().modules[SKIA].exportsFor!({ projectRoot: root, platform: "ios" })).toThrow(
      /could not read the named exports of '@shopify\/react-native-skia'[\s\S]*cannot resolve '\.\/moved'[\s\S]*presets: \{ skia: false \}/,
    );
  });

  it("says what to do when CanvasKit cannot load", async () => {
    // The stand-in has no canvaskit-wasm beside it.
    const g = globalThis as any;
    const canvasKit = g.CanvasKit;
    delete g.CanvasKit;
    vi.stubEnv("VITEST_NATIVE_PROJECT_ROOT", shopifyOnlyProject());
    try {
      await expect(skia().prepare!()).rejects.toThrow(
        /could not load CanvasKit[\s\S]*canvaskit-wasm[\s\S]*presets: \{ skia: false \}/,
      );
    } finally {
      vi.unstubAllEnvs();
      g.CanvasKit = canvasKit;
    }
  });

  it("keeps the CanvasKit a worker already loaded", async () => {
    const before = (globalThis as any).CanvasKit;
    expect(before).toBeDefined();
    await skia().prepare!();
    expect((globalThis as any).CanvasKit).toBe(before);
  });

  it("finds a package whose exports map does not expose package.json", () => {
    const root = shopifyOnlyProject();
    const dir = path.join(root, "node_modules", SKIA);
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: SKIA, version: "9.0.0", exports: { ".": "./lib/module/index.js" } }),
    );
    expect(skia().modules[SKIA].exportsFor!({ projectRoot: root, platform: "ios" })).toEqual([
      "Canvas",
      "Skia",
    ]);
  });

  it("says so when it is enabled and Skia is not installed", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-skia-none-"));
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    vi.stubEnv("VITEST_NATIVE_PROJECT_ROOT", root);
    try {
      await expect(skia().prepare!()).rejects.toThrow(
        /neither react-native-skia nor @shopify\/react-native-skia resolves/,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("says what to do when its module is built before CanvasKit loads", () => {
    const g = globalThis as any;
    const canvasKit = g.CanvasKit;
    delete g.CanvasKit;
    try {
      expect(() => skia().modules[SKIA].factory()).toThrow(/before CanvasKit loaded/);
    } finally {
      g.CanvasKit = canvasKit;
    }
  });
});

describe("skia preset under the mock engine", () => {
  it("computes with real Skia", () => {
    const bounds = Skia.Path.Rect(Skia.XYWHRect(0, 0, 10, 20)).computeTightBounds();
    expect([bounds.width, bounds.height]).toEqual([10, 20]);
  });

  it("renders a Canvas and its drawing", async () => {
    await render(
      <Canvas testID="canvas">
        <Circle cx={1} cy={1} r={1} />
      </Canvas>,
    );
    expect(screen.getByTestId("canvas")).toBeTruthy();
    expect(matchFont({ fontSize: 12 }).getSize()).toBe(12);
    expect(useFont(1, 18)!.getSize()).toBe(18);
    expect(useFont(1)!.getSize()).toBe(14);
  });

  it("serves Skia under its 3.x name, react-native-skia", () => {
    const svgPath = skia3.Skia.Path.MakeFromSVGString("M0 0 L4 0 L4 4 Z")!;
    expect(svgPath.computeTightBounds().width).toBe(4);
    expect(skia3.SkiaGraphiteView).toBeDefined();
  });

  it("answers require() with the same module", () => {
    const required = createRequire(import.meta.url)(SKIA);
    expect(required.Skia).toBe(Skia);
    expect(required.Canvas).toBe(Canvas);
  });
});
