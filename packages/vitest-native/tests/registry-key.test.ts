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
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const REGISTRY = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/native/registry.mjs"),
).href;

// In a child process: the key resolves `react-native` from the project, and this
// suite's own engine answers that request for the test process. A fresh process also
// reads each installed manifest afresh rather than from require()'s cache.
function registryKey(options: Record<string, unknown>): string {
  return execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { registryKey } from ${JSON.stringify(REGISTRY)};
       process.stdout.write(registryKey(${JSON.stringify(options)}));`,
    ],
    { encoding: "utf8" },
  );
}

const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * A project root whose installed dependency versions are exactly as given. The key
 * includes the files React Native resolves to, so comparisons install into one root: a
 * fresh root per key would differ by location alone and every "changes when" below
 * would pass vacuously.
 */
let shared: string | undefined;
function projectWith(versions: Record<string, string>): string {
  if (!shared) {
    shared = fs.mkdtempSync(path.join(os.tmpdir(), "vn-registry-key-"));
    roots.push(shared);
  }
  const root = shared;
  fs.rmSync(path.join(root, "node_modules"), { recursive: true, force: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }));
  for (const [name, version] of Object.entries(versions)) {
    const dir = path.join(root, "node_modules", ...name.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version }));
  }
  if (versions["react-native"]) installReactNative(root, versions["react-native"]);
  return root;
}

/** A resolvable react-native under `dir` (a key from an unresolvable one hashes "0"). */
function installReactNative(dir: string, version: string): void {
  const pkg = path.join(dir, "node_modules", "react-native");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({ name: "react-native", version, main: "index.js" }),
  );
  fs.writeFileSync(path.join(pkg, "index.js"), "module.exports = {};\n");
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
    // Held fixed, so a changed key comes from what is installed.
    reactNativeVersion: BASE["react-native"],
  });

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
    expect(keyFor({ ...BASE, [name]: version })).not.toBe(keyFor(BASE));
  });

  it("changes for a copied project, and not through a symlink to it", () => {
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

  it("changes when react-native resolves to a different copy from the same root", () => {
    // A workspace package resolving the hoisted react-native, then given its own.
    const root = projectWith(BASE);
    const app = path.join(root, "apps", "app");
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "app" }));
    const key = () =>
      registryKey({ projectRoot: app, platform: "ios", reactNativeVersion: "0.86.0" });
    const hoisted = key();
    installReactNative(app, BASE["react-native"]);
    expect(key()).not.toBe(hoisted);
  });

  it("is shared by projects that resolve the same react-native", () => {
    const root = projectWith(BASE);
    const sub = path.join(root, "packages", "lib");
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, "package.json"), JSON.stringify({ name: "lib" }));
    const key = (projectRoot: string) =>
      registryKey({ projectRoot, platform: "ios", reactNativeVersion: "0.86.0" });
    expect(key(sub)).toBe(key(root));
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
