// End-to-end wiring for the loaded-Expo-SDK warning: the native engine's require hook
// (native/hooks.mjs) names an expo-modules-core from an unsupported SDK when a test
// loads it, and says nothing about one a package only declares. The check itself is
// unit-tested in tests/expo-sdk-loaded.test.ts; this exercises the live hook and the
// supported range the plugin hands the worker.
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const made: string[] = [];
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

/** A pnpm-style store: `name@version` packages, each `build/index.js` running `body`. */
function store(packages: Record<string, { manifest?: object; body?: string }>): string {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-expo-load-"));
  made.push(root);
  for (const [id, { manifest = {}, body = "module.exports = {};" }] of Object.entries(packages)) {
    const at = id.lastIndexOf("@");
    const dir = path.join(root, "node_modules", id.slice(0, at));
    fs.mkdirSync(path.join(dir, "build"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: id.slice(0, at),
        version: id.slice(at + 1),
        main: "build/index.js",
        ...manifest,
      }),
    );
    fs.writeFileSync(path.join(dir, "build", "index.js"), body);
  }
  return root;
}

const expoWarnings = (warn: { mock: { calls: unknown[][] } }) =>
  warn.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("Expo SDK"));

describe("an Expo package a test loads", () => {
  it("names an expo-modules-core from SDK 54 or older, once", () => {
    const root = store({
      "expo-thing@1.0.0": { body: 'module.exports = require("expo-modules-core");' },
      "expo-modules-core@3.0.29": {},
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = createRequire(path.join(root, "index.js"));
    load("expo-thing");
    load(path.join(root, "node_modules/expo-modules-core/build/index.js"));
    expect(expoWarnings(warn)).toEqual([
      `[vitest-native] expo-modules-core 3.0.29 (${root}/node_modules/expo-modules-core) is ` +
        "from Expo SDK 54 or older; vitest-native supports Expo SDK 57 and 58. Tests that load " +
        "it can fail: upgrade to a supported Expo SDK.",
    ]);
  });

  it("is silent about a supported one", () => {
    const root = store({ "expo-modules-core@58.0.27": {}, "expo@57.0.24": {} });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = createRequire(path.join(root, "index.js"));
    load("expo-modules-core");
    load("expo");
    expect(expoWarnings(warn)).toEqual([]);
  });

  it("is silent about an expo a package only peers, optionally, and never loads", () => {
    const root = store({
      "material-icons@14.0.0": {
        manifest: {
          peerDependencies: { expo: "*" },
          peerDependenciesMeta: { expo: { optional: true } },
        },
      },
      "expo@54.0.33": {},
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createRequire(path.join(root, "index.js"))("material-icons");
    expect(expoWarnings(warn)).toEqual([]);
  });
});
