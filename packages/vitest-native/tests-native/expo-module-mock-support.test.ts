/**
 * An Expo module's `mocks/<NativeModule>` file is written for Jest: `jest.fn` around each
 * member and `jest.requireActual` for what the web build supplies (expo-font's
 * ExpoFontLoader). It loads as the package's own test support (native/library-jest.mjs),
 * with a `jest` of its own, so no jest-compat layer and no `jest` global is needed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { expoModuleMock } from "../src/native/expo-module-mocks.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-expo-mock-support-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function expoModule(name: string, files: Record<string, string>) {
  const dir = path.join(root, "node_modules", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  fs.writeFileSync(path.join(dir, "expo-module.config.json"), "{}");
  for (const [file, src] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), src);
  }
}

describe("an Expo module's own native-module mock", () => {
  it("loads without a jest global, with the library's own jest", () => {
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    expoModule("expo-font", {
      "src/ExpoFontLoader.web.js": "exports.isLoaded = (name) => name === 'loaded';",
      "mocks/ExpoFontLoader.js": [
        "exports.getLoadedFonts = jest.fn(function mockGetLoadedFonts() { return []; });",
        "const web = jest.requireActual('../src/ExpoFontLoader.web');",
        "exports.isLoaded = jest.fn(web.isLoaded);",
        "exports.loadAsync = jest.fn();",
        "exports.sawGlobal = typeof globalThis.jest;",
      ].join("\n"),
    });
    expect(typeof (globalThis as { jest?: unknown }).jest).toBe("undefined");
    const members = expoModuleMock(root, "ExpoFontLoader", (fn: () => unknown) => vi.fn(fn));
    expect(members.getLoadedFonts()).toEqual([]);
    expect(members.isLoaded("loaded")).toBe(true);
    expect(members.isLoaded("other")).toBe(false);
    expect(members.loadAsync()).toBeUndefined();
    expect(vi.isMockFunction(members.getLoadedFonts)).toBe(true);
    // The jest is the file's own: nothing was installed on the global, before or after.
    expect(members.sawGlobal).toBe("undefined");
    expect(typeof (globalThis as { jest?: unknown }).jest).toBe("undefined");
  });

  it("keeps a mock's own implementation through a reset", () => {
    const members = expoModuleMock(root, "ExpoFontLoader", (fn: () => unknown) => vi.fn(fn));
    members.getLoadedFonts.mockReset();
    expect(members.getLoadedFonts()).toEqual([]);
  });
});
