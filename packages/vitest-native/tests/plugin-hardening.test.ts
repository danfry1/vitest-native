/**
 * Hardening regressions for the plugin's asset stubbing and Flow-strip
 * transform (mock engine).
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { reactNative } from "../src/index.js";
import { gestureHandler } from "../src/presets/index.js";

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
  await plugin.config({ root: projectRoot }, SERVE_ENV);
  await plugin.configResolved({ root: projectRoot });
  return plugin;
}

describe("asset stubbing (mock engine)", () => {
  it("matches asset extensions case-insensitively, like the native loader", async () => {
    const plugin = await makePlugin();
    expect(plugin.load("/proj/assets/LOGO.PNG")).toBe(`export default "LOGO.PNG";`);
    expect(plugin.load("/proj/assets/Icon.TTF")).toBe(`export default "Icon.TTF";`);
  });

  it("emits valid JS for basenames containing quotes", async () => {
    const plugin = await makePlugin();
    const code = plugin.load(`/proj/assets/we"ird.png`);
    // JSON.stringify-escaped — raw interpolation would emit a syntax error here.
    expect(code).toBe(`export default ${JSON.stringify(`we"ird.png`)};`);
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
    expect(() =>
      plugin.transform(
        `const marker = "@flow"; const = broken;`,
        "/proj/node_modules/react-native-thing/lib/broken.js",
      ),
    ).not.toThrow();
    expect(
      plugin.transform(
        `const marker = "@flow"; const = broken;`,
        "/proj/node_modules/react-native-thing/lib/broken.js",
      ),
    ).toBeUndefined();
  });
});
