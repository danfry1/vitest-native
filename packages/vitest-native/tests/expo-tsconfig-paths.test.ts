import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { expoTsconfigPaths } from "../src/plugin.js";
import { reactNative } from "../src/index.js";

// Expo CLI resolves tsconfig `paths` by default (experiments.tsconfigPaths), and the
// SDK 57 template imports its components through `@/…`; bare React Native's Metro does
// not. The plugin mirrors that, using Vite 8's own `resolve.tsconfigPaths`.
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-tsconfig-paths-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

const EXPO = JSON.stringify({ dependencies: { expo: "~57.0.26" } });
const TSCONFIG = `{\n  // comments, as the template has\n  "compilerOptions": { "paths": { "@/*": ["./src/*"] } }\n}\n`;

describe("expoTsconfigPaths", () => {
  it("enables Vite 8's tsconfig paths for an Expo project", () => {
    expect(
      expoTsconfigPaths(project({ "package.json": EXPO, "tsconfig.json": TSCONFIG }), undefined, 8),
    ).toBe("enable");
    const dev = JSON.stringify({ devDependencies: { expo: "57.0.0" } });
    expect(
      expoTsconfigPaths(project({ "package.json": dev, "tsconfig.json": "{}" }), undefined, 8),
    ).toBe("enable");
  });

  it("leaves it to the user, an app.json opt-out, and non-Expo projects", () => {
    const root = project({ "package.json": EXPO, "tsconfig.json": TSCONFIG });
    expect(expoTsconfigPaths(root, false, 8)).toBe(null);
    expect(expoTsconfigPaths(root, true, 8)).toBe(null);
    const optedOut = project({
      "package.json": EXPO,
      "tsconfig.json": TSCONFIG,
      "app.json": JSON.stringify({ expo: { experiments: { tsconfigPaths: false } } }),
    });
    expect(expoTsconfigPaths(optedOut, undefined, 8)).toBe(null);
    const bare = JSON.stringify({ dependencies: { "react-native": "0.87.1" } });
    expect(
      expoTsconfigPaths(project({ "package.json": bare, "tsconfig.json": TSCONFIG }), undefined, 8),
    ).toBe(null);
    expect(expoTsconfigPaths(project({ "package.json": EXPO }), undefined, 8)).toBe(null);
  });

  it("reports Vite 6 and 7, which cannot resolve tsconfig paths, only when paths exist", () => {
    expect(
      expoTsconfigPaths(project({ "package.json": EXPO, "tsconfig.json": TSCONFIG }), undefined, 7),
    ).toBe("unsupported");
    expect(
      expoTsconfigPaths(project({ "package.json": EXPO, "tsconfig.json": "{}" }), undefined, 7),
    ).toBe(null);
  });
});

describe("the plugin", () => {
  it("turns on resolve.tsconfigPaths for an Expo project, and leaves a user's choice", async () => {
    // A real project root (this package's, so its peers resolve), seen as an Expo app.
    const root = project({ "package.json": EXPO, "tsconfig.json": TSCONFIG });
    for (const name of ["node_modules"]) {
      fs.symlinkSync(
        path.resolve(import.meta.dirname, "..", name),
        path.join(root, name),
        "junction",
      );
    }
    const run = async (resolve?: object) => {
      const plugin = reactNative({ engine: "mock" }) as any;
      return plugin.config.handler.call(
        {},
        { root, ...(resolve ? { resolve } : {}) },
        {
          command: "serve",
          mode: "test",
        },
      );
    };
    expect((await run()).resolve.tsconfigPaths).toBe(true);
    expect((await run({ tsconfigPaths: false })).resolve?.tsconfigPaths).toBeUndefined();
  });
});
