/**
 * The precompiled React Native registry is disk-cached and reused across runs, so
 * its key has to name every input that changes what the registry means.
 *
 * `react` was missing. React Native's modules resolve React at runtime, and the
 * manifest check cannot cover it — that stats React Native's own files, which do
 * not change when React alone is upgraded. So upgrading React on a fixed React
 * Native served a registry built against the previous React, and the native suite
 * failed with a null React dispatcher and React Native singletons that no longer
 * compared equal. Deleting node_modules/.cache/vitest-native was the only cure.
 */
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { registryKey } from "../src/native/registry.mjs";

const moduleCache = createRequire(import.meta.url).cache;
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * A project root whose installed dependency versions are exactly as given. The key
 * includes the project's location, so comparisons install into one root: a fresh root
 * per key would differ by location alone and every "changes when" below would pass
 * vacuously.
 */
let shared: string | undefined;
function projectWith(versions: Record<string, string>): string {
  if (!shared) {
    // The real path: require() caches under it, and the purge below matches by prefix.
    shared = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-registry-key-")));
    roots.push(shared);
  }
  const root = shared;
  fs.rmSync(path.join(root, "node_modules"), { recursive: true, force: true });
  // registryKey reads versions with require(), which caches each manifest by path.
  for (const id of Object.keys(moduleCache)) if (id.startsWith(root)) delete moduleCache[id];
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }));
  for (const [name, version] of Object.entries(versions)) {
    const dir = path.join(root, "node_modules", ...name.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version }));
  }
  return root;
}

const BASE = {
  react: "19.2.3",
  "react-native": "0.86.0",
  "@babel/core": "7.28.0",
  "@react-native/babel-preset": "0.86.0",
};

const keyFor = (versions: Record<string, string>) =>
  registryKey({
    projectRoot: projectWith(versions),
    platform: "ios",
    reactNativeVersion: versions["react-native"],
  }) as string;

describe("registry cache key", () => {
  it("is stable for the same installed versions", () => {
    // A control: without this, a key that changed on every call would make every
    // assertion below pass while proving nothing.
    expect(keyFor(BASE)).toBe(keyFor(BASE));
  });

  it("changes when react changes, with react-native held fixed", () => {
    expect(keyFor({ ...BASE, react: "19.2.8" })).not.toBe(keyFor(BASE));
  });

  it.each([
    ["react-native", "0.85.0"],
    ["@babel/core", "7.29.0"],
    ["@react-native/babel-preset", "0.85.0"],
  ])("changes when %s changes", (name, version) => {
    const changed = { ...BASE, [name]: version };
    const key =
      name === "react-native"
        ? (registryKey({
            projectRoot: projectWith(changed),
            platform: "ios",
            reactNativeVersion: version,
          }) as string)
        : keyFor(changed);
    expect(key).not.toBe(keyFor(BASE));
  });

  it("changes with the project's location, and not through a symlink to it", () => {
    const root = projectWith(BASE);
    const key = (projectRoot: string) =>
      registryKey({ projectRoot, platform: "ios", reactNativeVersion: "0.86.0" });
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "vn-registry-key-copy-"));
    roots.push(copy);
    fs.cpSync(root, copy, { recursive: true });
    expect(key(copy)).not.toBe(key(root));
    if (process.platform === "win32") return;
    const link = `${copy}-link`;
    fs.symlinkSync(root, link, "dir");
    roots.push(link);
    expect(key(link)).toBe(key(root));
  });

  it("changes with the platform", () => {
    const root = projectWith(BASE);
    const ios = registryKey({ projectRoot: root, platform: "ios", reactNativeVersion: "0.86.0" });
    const android = registryKey({
      projectRoot: root,
      platform: "android",
      reactNativeVersion: "0.86.0",
    });
    expect(ios).not.toBe(android);
  });

  it("keys asset extensions independent of spelling and declaration order", () => {
    const root = projectWith(BASE);
    const base = { projectRoot: root, platform: "ios", reactNativeVersion: "0.86.0" };
    const without = registryKey(base);
    const png = registryKey({ ...base, assetExts: ["png"] });
    const both = registryKey({ ...base, assetExts: ["png", "svg"] });
    const reordered = registryKey({ ...base, assetExts: [".SVG", ".png", "png"] });

    expect(png).not.toBe(without);
    expect(both).not.toBe(png);
    expect(reordered).toBe(both);
  });

  it("keys source extension precedence in declaration order", () => {
    const root = projectWith(BASE);
    const base = { projectRoot: root, platform: "ios", reactNativeVersion: "0.86.0" };
    const jsFirst = registryKey({ ...base, sourceExts: ["js", "tsx"] });
    const tsxFirst = registryKey({ ...base, sourceExts: ["tsx", "js"] });

    expect(jsFirst).not.toBe(tsxFirst);
  });

  it("keys additional deep entrypoints independent of declaration order", () => {
    const root = projectWith(BASE);
    const base = { projectRoot: root, platform: "ios", reactNativeVersion: "0.86.0" };
    const without = registryKey(base);
    const first = registryKey({ ...base, additionalEntries: ["react-native/deep-a"] });
    const both = registryKey({
      ...base,
      additionalEntries: ["react-native/deep-a", "react-native/deep-b"],
    });
    const reversed = registryKey({
      ...base,
      additionalEntries: ["react-native/deep-b", "react-native/deep-a"],
    });

    expect(first).not.toBe(without);
    expect(both).not.toBe(first);
    expect(reversed).toBe(both);
    expect(
      registryKey({
        ...base,
        additionalEntries: ["react-native/deep-a", "react-native/deep-a"],
      }),
    ).toBe(first);
  });
});
