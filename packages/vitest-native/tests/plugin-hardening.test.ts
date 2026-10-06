/**
 * Hardening regressions for the plugin's asset modules and Flow-strip
 * transform (mock engine).
 */
import { afterAll, describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { reactNative } from "../src/index.js";
import { gestureHandler } from "../src/presets/index.js";
import { runPluginConfig } from "./plugin-config.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findUp(rel: string, start: string): string {
  let dir = start;
  for (;;) {
    const candidate = path.join(dir, rel);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`${rel} not found from ${start}`);
    dir = parent;
  }
}
const projectRoot = path.dirname(findUp("package.json", HERE));
const SERVE_ENV = { command: "serve", mode: "test" } as const;

async function makePlugin() {
  const plugin = reactNative({ engine: "mock", presets: [gestureHandler()] }) as any;
  await runPluginConfig(plugin, { root: projectRoot }, SERVE_ENV);
  await plugin.configResolved({ root: projectRoot });
  return plugin;
}

/**
 * Evaluate an emitted mock-engine asset module against a stand-in for the mock's
 * AssetRegistry, returning its default export and what it registered.
 */
function evaluateAssetModule(code: string) {
  const registered: Record<string, unknown>[] = [];
  const registry = {
    registerAsset: (asset: Record<string, unknown>) => registered.push(asset),
  };
  const expression = code.replace(/^export default /, "").replace(/;\s*$/, "");
  const value = new Function("globalThis", `return ${expression};`)({
    __vitest_native_mock: { AssetRegistry: registry },
  });
  return { value, registered };
}

describe("asset modules (mock engine)", () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-assets-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("matches asset extensions case-insensitively, like the native loader", async () => {
    const plugin = await makePlugin();
    fs.writeFileSync(path.join(dir, "LOGO.PNG"), "not an image");
    fs.writeFileSync(path.join(dir, "Icon.TTF"), "not a font");
    const logo = evaluateAssetModule(plugin.load(path.join(dir, "LOGO.PNG")));
    expect(logo.value).toBe(1);
    // metro/src/Assets.js isAssetTypeAnImage compares the type case-sensitively, so
    // Metro registers an upper-case extension without dimensions as well.
    expect(logo.registered).toEqual([
      expect.objectContaining({ __packager_asset: true, name: "LOGO", type: "PNG", scales: [1] }),
    ]);
    expect(logo.registered[0]).not.toHaveProperty("width");
    expect(evaluateAssetModule(plugin.load(path.join(dir, "Icon.TTF"))).registered).toEqual([
      expect.objectContaining({ name: "Icon", type: "TTF" }),
    ]);
  });

  it("emits valid JS for file names containing quotes and dollar signs", async () => {
    const plugin = await makePlugin();
    // Not `"` or `\`: Windows rejects those in file names.
    const name = "we'ird ${x}`.png";
    fs.writeFileSync(path.join(dir, name), "x");
    // Assert the PROPERTY (the module evaluates and registers the real name), not
    // the mechanism — raw interpolation would emit a syntax error here.
    const { value, registered } = evaluateAssetModule(plugin.load(path.join(dir, name)));
    expect(value).toBe(1);
    expect(registered[0]).toMatchObject({ name: "we'ird ${x}`", type: "png" });
  });
});

describe("Flow-strip transform guard (mock engine)", () => {
  it("still strips genuine Flow sources in react-native ecosystem packages", async () => {
    const plugin = await makePlugin();
    const result = plugin.transform(
      `// @flow\ntype Props = { x: number };\nmodule.exports = function f(p: Props) { return p.x; };`,
      "/proj/node_modules/react-native-thing/lib/f.js",
    );
    expect(result).toBeTruthy();
    expect(result.code).not.toContain("Props");
    expect(result.code).toContain("return p.x");
  });

  it("skips files the stripper cannot parse instead of throwing", async () => {
    const plugin = await makePlugin();
    // "@flow" appears in a string of a file that is not valid input for the
    // stripper — previously this threw and took down the whole transform
    // pipeline; now it passes through untouched.
    let result: unknown = "not called";
    expect(() => {
      result = plugin.transform(
        `const marker = "@flow"; const = broken;`,
        "/proj/node_modules/react-native-thing/lib/broken.js",
      );
    }).not.toThrow();
    expect(result).toBeUndefined();
  });
});
