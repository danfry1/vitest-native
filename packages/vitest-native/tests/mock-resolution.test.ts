import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactNative } from "../src/index.js";
import { buildReactNativeMock } from "../src/mocks/registry.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function mockEnginePlugin() {
  const plugin = reactNative({ engine: "mock" }) as unknown as {
    config: (c: object, e: object) => Promise<unknown>;
    configResolved: (c: { root: string }) => Promise<void>;
    transform: (code: string, id: string) => unknown;
  };
  await plugin.config({}, { command: "serve", mode: "test" });
  await plugin.configResolved({ root: process.cwd() });
  return plugin;
}

describe("mock engine: virtual react-native modules", () => {
  it("generates every export the mock actually has", () => {
    // The plugin builds its virtual modules from a name list held separately from
    // the mock itself, kept in step by hand. A name missing from the list makes
    // `import { X } from 'react-native'` fail even though the mock provides X; a
    // stale one exports undefined. Neither shows up until someone imports it.
    const source = fs.readFileSync(path.join(HERE, "..", "src", "plugin.ts"), "utf8");
    const block = /const RN_EXPORT_NAMES = \[([\s\S]*?)\n\];/.exec(source);
    expect(block).not.toBe(null);
    const listed = new Set([...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
    const mocked = new Set(
      Object.keys(buildReactNativeMock("ios") as Record<string, unknown>).filter(
        (k) => k !== "default" && k !== "__esModule",
      ),
    );
    expect([...mocked].filter((k) => !listed.has(k)).sort()).toEqual([]);
    expect([...listed].filter((k) => !mocked.has(k)).sort()).toEqual([]);
  });
});

describe("mock engine: Flow-strip targeting", () => {
  // The mock engine Flow-strips React Native ecosystem packages pulled into the Vite
  // graph. It used to test for "react-native" anywhere in the path, which also
  // matched files that have nothing to do with React Native.
  const flowish = "/** documentation mentioning @flow */\nmodule.exports = 1;\n";

  it("strips real react-native ecosystem packages, scoped or not", async () => {
    const plugin = await mockEnginePlugin();
    const strips = (id: string) => plugin.transform(flowish, id) !== undefined;
    expect(strips("/p/node_modules/react-native-svg/lib/x.js")).toBe(true);
    // A package whose SCOPE is @react-native*.
    expect(strips("/p/node_modules/@react-native-community/slider/js/x.js")).toBe(true);
    expect(strips("/p/node_modules/@react-native-firebase/app/lib/x.js")).toBe(true);
    // A React Native package under someone else's scope. Narrowing the original
    // substring test to an unscoped prefix dropped these — @shopify/react-native-skia
    // is not a rare shape.
    expect(strips("/p/node_modules/@shopify/react-native-skia/lib/x.js")).toBe(true);
  });

  it("leaves unrelated dependencies alone", async () => {
    const plugin = await mockEnginePlugin();
    // A project directory that happens to contain the words — common enough
    // (react-native-app, my-react-native) — used to make every dependency match.
    expect(
      plugin.transform(flowish, "/Users/dev/react-native-app/node_modules/lodash/index.js"),
    ).toBe(undefined);
    // A package whose name contains but does not start with the prefix.
    expect(
      plugin.transform(flowish, "/p/node_modules/eslint-plugin-react-native/lib/rules/x.js"),
    ).toBe(undefined);
  });
});
