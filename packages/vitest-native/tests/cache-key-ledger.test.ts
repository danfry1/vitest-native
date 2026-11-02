/**
 * Cache-key ledger: every input that changes what the transform or the precompiled
 * registry emits must change its cache key.
 *
 * Both caches outlive the process (node_modules/.cache/vitest-native), so an input
 * missing from a key does not fail anything: a warm cache keeps serving the output
 * built from the old input. That is how the Flow-enum fix shipped invisible to every
 * warm cache until TRANSFORM_CACHE_VERSION went to 4. Each test below varies ONE
 * input and requires the key to move; removing that input from the key turns it red.
 *
 * The existing tests (registry-key.test.ts, transform-cache.test.ts) cover the
 * installed versions and the per-file disk key. This file covers the inputs they did
 * not: the transform version and the boundary sources in the registry key, Expo, the
 * Babel env in both keys, the optional export-namespace-from plugin, the files the
 * registry is seeded from (registry-location.test.ts covers copies and symlinks end to
 * end), and the ES-module goal and interop revision in the per-file key.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { registryKey } from "../src/native/registry.mjs";
import {
  TRANSFORM_CACHE_VERSION,
  transformCacheDir,
  transformOptionsFor,
  transformRN,
  // @ts-expect-error — runtime .mjs, no types
} from "../src/native/transform.mjs";

const req = createRequire(import.meta.url);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("../src/native/transform.mjs");
  vi.doUnmock("../src/native/boundary.mjs");
  vi.doUnmock("../src/native/esm-interop.mjs");
  vi.resetModules();
});

function tempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }));
  return root;
}

function writePackage(root: string, name: string, version: string, index?: string) {
  const dir = path.join(root, "node_modules", ...name.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name, version, ...(index ? { main: "index.js" } : {}) }),
  );
  if (index) fs.writeFileSync(path.join(dir, "index.js"), index);
}

describe("registry cache key ledger", () => {
  const BASE = {
    react: "19.2.3",
    "react-native": "0.86.0",
    "@babel/core": "7.28.0",
    "@react-native/babel-preset": "0.86.0",
  };
  function projectWith(versions: Record<string, string>): string {
    const root = tempRoot("vn-key-ledger-");
    for (const [name, version] of Object.entries(versions)) writePackage(root, name, version);
    return root;
  }
  const keyWith = (key: typeof registryKey, root: string) =>
    key({ projectRoot: root, platform: "ios", reactNativeVersion: "0.86.0" }) as string;

  it("is stable when nothing changes (control)", () => {
    const root = projectWith(BASE);
    expect(keyWith(registryKey, root)).toBe(keyWith(registryKey, root));
  });

  it("changes with TRANSFORM_CACHE_VERSION: the registry stores transformed source", async () => {
    const root = projectWith(BASE);
    const before = keyWith(registryKey, root);
    vi.resetModules();
    vi.doMock("../src/native/transform.mjs", async (importOriginal) => ({
      ...(await importOriginal<Record<string, unknown>>()),
      TRANSFORM_CACHE_VERSION: TRANSFORM_CACHE_VERSION + 1,
    }));
    const bumped = await import("../src/native/registry.mjs");
    expect(keyWith(bumped.registryKey, root)).not.toBe(before);
  });

  it("changes when a boundary mock's source changes: the mocks are compiled in", async () => {
    const root = projectWith(BASE);
    const before = keyWith(registryKey, root);
    vi.resetModules();
    vi.doMock("../src/native/boundary.mjs", async (importOriginal) => {
      const original = await importOriginal<{
        boundarySourceFor: (...args: unknown[]) => string | null;
      }>();
      return {
        ...original,
        boundarySourceFor: (...args: unknown[]) => {
          const source = original.boundarySourceFor(...args);
          return source == null ? source : `${source}\n// edited`;
        },
      };
    });
    const edited = await import("../src/native/registry.mjs");
    expect(keyWith(edited.registryKey, root)).not.toBe(before);
  });

  it("changes when expo is installed or upgraded: asset descriptors carry its hashes", () => {
    const without = keyWith(registryKey, projectWith(BASE));
    const expo57 = keyWith(registryKey, projectWith({ ...BASE, expo: "57.0.0" }));
    const expo58 = keyWith(registryKey, projectWith({ ...BASE, expo: "58.0.0" }));
    expect(expo57).not.toBe(without);
    expect(expo58).not.toBe(expo57);
  });

  /**
   * The key as a plain Node process computes it. This suite's own config resolves
   * `react-native` for every importer, so in-process every fixture would resolve to
   * the same file (registry-location.test.ts measures the same way).
   */
  const keyInNode = (root: string) =>
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { registryKey } from ${JSON.stringify(pathToFileURL(path.join(packageRoot, "src/native/registry.mjs")).href)};
process.stdout.write(registryKey({ projectRoot: ${JSON.stringify(root)}, platform: "ios", reactNativeVersion: "0.86.0" }));`,
      ],
      { encoding: "utf8" },
    );
  const withReactNative = () => {
    const root = projectWith(BASE);
    writePackage(root, "react-native", BASE["react-native"], "module.exports = {};");
    return root;
  };

  it("changes with the react-native entry it is seeded from: it bakes in absolute paths", () => {
    // Two projects with identical versions differ only in where react-native resolves.
    const a = withReactNative();
    expect(keyInNode(a)).toBe(keyInNode(a));
    expect(keyInNode(withReactNative())).not.toBe(keyInNode(a));
  });

  it("changes with the asset registry it resolves: image assets register through it", () => {
    const root = withReactNative();
    const before = keyInNode(root);
    const image = path.join(root, "node_modules", "react-native", "Libraries", "Image");
    fs.mkdirSync(image, { recursive: true });
    fs.writeFileSync(path.join(image, "AssetRegistry.js"), "module.exports = {};");
    expect(keyInNode(root)).not.toBe(before);
  });

  it("changes with the Babel env (BABEL_ENV, else NODE_ENV)", () => {
    const root = projectWith(BASE);
    vi.stubEnv("BABEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");
    const test = keyWith(registryKey, root);
    vi.stubEnv("NODE_ENV", "development");
    const development = keyWith(registryKey, root);
    vi.stubEnv("BABEL_ENV", "production");
    const babelEnv = keyWith(registryKey, root);
    expect(development).not.toBe(test);
    expect(babelEnv).not.toBe(development);
  });
});

describe("transform cache directory ledger", () => {
  /** A project whose stub preset resolves without loading Babel. */
  function transformRoot({ exportNamespaceFrom = false } = {}): string {
    const root = tempRoot("vn-transform-ledger-");
    writePackage(
      root,
      "@react-native/babel-preset",
      "0.0.1-ledger",
      "module.exports = () => ({});",
    );
    const babelScope = path.join(root, "node_modules", "@babel");
    fs.mkdirSync(babelScope, { recursive: true });
    fs.symlinkSync(
      path.dirname(fs.realpathSync(req.resolve("@babel/core/package.json"))),
      path.join(babelScope, "core"),
      "dir",
    );
    if (exportNamespaceFrom) {
      writePackage(
        root,
        "@babel/plugin-transform-export-namespace-from",
        "7.0.0",
        "module.exports = () => ({ visitor: {} });",
      );
    }
    return root;
  }
  const dirName = (root: string) => {
    transformOptionsFor(root, path.join(root, "a.js"));
    return path.basename(transformCacheDir(root) as string);
  };

  it("keys the Babel env: the preset's dev JSX transform emits different code", () => {
    vi.stubEnv("BABEL_ENV", "development");
    const development = dirName(transformRoot());
    vi.stubEnv("BABEL_ENV", "production");
    const production = dirName(transformRoot());
    expect(development).toContain("-development-");
    expect(production).toContain("-production-");
    expect(development.replace("-development-", "-")).toBe(production.replace("-production-", "-"));
  });

  it("keys the export-namespace-from plugin's presence: it rewrites `export * as ns`", () => {
    const withPlugin = transformRoot({ exportNamespaceFrom: true });
    const withoutPlugin = transformRoot();
    const plugins = (root: string) =>
      (transformOptionsFor(root, path.join(root, "a.js")).plugins as string[]).length;
    expect(plugins(withPlugin)).toBe(1);
    expect(plugins(withoutPlugin)).toBe(0);
    expect(dirName(withPlugin)).not.toBe(dirName(withoutPlugin));
  });

  it("keys TRANSFORM_CACHE_VERSION", () => {
    expect(dirName(transformRoot())).toContain(`-v${TRANSFORM_CACHE_VERSION}`);
  });

  /**
   * One file in a package whose `type` decides its goal. The goal comes from the
   * package.json, not the file's bytes, so it must key the per-file entry itself.
   */
  function goalPackage(root: string, type: "module" | "commonjs"): string {
    const dir = path.join(root, "node_modules", "goal-lib");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "goal-lib", type }));
    const file = path.join(dir, "index.js");
    fs.writeFileSync(file, "export const value = 1;\n");
    return file;
  }
  const entries = (root: string) =>
    fs.readdirSync(transformCacheDir(root) as string).filter((name) => name.endsWith(".js"));

  it("keys a file's ES-module goal: only ESM-goal output carries the default-import interop", async () => {
    const root = transformRoot();
    const file = goalPackage(root, "commonjs");
    transformRN(file, undefined, root);
    expect(entries(root)).toHaveLength(1);
    goalPackage(root, "module");
    // A fresh module instance: the in-memory layer is keyed on the file's stat alone.
    vi.resetModules();
    const fresh = await import("../src/native/transform.mjs");
    fresh.transformRN(file, undefined, root);
    expect(entries(root)).toHaveLength(2);
  });

  it("keys the interop runtime's revision on ESM-goal entries", async () => {
    const root = transformRoot();
    const file = goalPackage(root, "module");
    transformRN(file, undefined, root);
    expect(entries(root)).toHaveLength(1);
    vi.resetModules();
    vi.doMock("../src/native/esm-interop.mjs", async (importOriginal) => ({
      ...(await importOriginal<Record<string, unknown>>()),
      ESM_INTEROP_RUNTIME: "vitest-native.esmInterop.ledger",
    }));
    const bumped = await import("../src/native/transform.mjs");
    bumped.transformRN(file, undefined, root);
    expect(entries(root)).toHaveLength(2);
  });
});

/**
 * The transform's own Babel options, fingerprinted per TRANSFORM_CACHE_VERSION.
 *
 * Preset, Babel and plugin VERSIONS are keyed by the directory, so they are
 * normalised out (paths become package names). What remains is what this package
 * decides: which plugins run and in what order, the preset options, the caller. A
 * change to any of those changes the output with no version moving, which is the
 * Flow-enum incident exactly (a plugin added ahead of the preset). Bump
 * TRANSFORM_CACHE_VERSION in src/native/transform.mjs and ADD a row here; never edit
 * a recorded row, or a warm cache serves the old output to everyone who has one.
 */
type Branch = "reactNative" | "expo";
const OPTION_FINGERPRINTS: Record<number, Record<Branch, string>> = {
  4: { reactNative: "75157f5fe5752a49", expo: "5cda116238ba12e4" },
};

function packageName(file: string): string {
  const parts = file.split(/[\\/]/);
  const at = parts.lastIndexOf("node_modules");
  if (at === -1) return path.relative(packageRoot, file);
  return parts[at + 1].startsWith("@") ? `${parts[at + 1]}/${parts[at + 2]}` : parts[at + 1];
}

/**
 * An Expo project with no React Native preset: the branch Expo SDK 56+ projects take
 * by default (babel-preset.mjs resolves expo/internal/babel-preset). Stubs only, so
 * nothing but option resolution runs.
 */
function expoOnlyRoot(): string {
  const root = tempRoot("vn-transform-ledger-expo-");
  writePackage(root, "expo", "57.0.0");
  fs.mkdirSync(path.join(root, "node_modules", "expo", "internal"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "node_modules", "expo", "internal", "babel-preset.js"),
    'module.exports = require("babel-preset-expo");',
  );
  writePackage(root, "babel-preset-expo", "57.0.0", "module.exports = () => ({});");
  const babelScope = path.join(root, "node_modules", "@babel");
  fs.mkdirSync(babelScope, { recursive: true });
  fs.symlinkSync(
    path.dirname(fs.realpathSync(req.resolve("@babel/core/package.json"))),
    path.join(babelScope, "core"),
    "dir",
  );
  return root;
}

function fingerprintOf(root: string) {
  const options = transformOptionsFor(root, path.join(root, "fixture.js"), "ios");
  const {
    filename: _filename,
    plugins,
    presets,
    ...rest
  } = options as {
    filename: string;
    plugins: string[];
    presets: [string, unknown][];
  };
  const normalised = {
    ...rest,
    // The optional plugin is applied when the project installs it, and its presence
    // is keyed by the directory's `-ns` suffix (tested above), so it is left out
    // here: the fingerprint must not depend on what an install happens to contain.
    plugins: plugins
      .map(packageName)
      .filter((name) => name !== "@babel/plugin-transform-export-namespace-from"),
    presets: presets.map(([preset, presetOptions]) => [packageName(preset), presetOptions]),
  };
  const fingerprint = crypto
    .createHash("sha1")
    .update(JSON.stringify(normalised))
    .digest("hex")
    .slice(0, 16);
  return { plugins: normalised.plugins, presets: normalised.presets, normalised, fingerprint };
}

describe("transform output guard", () => {
  const branches: [Branch, () => string][] = [
    ["reactNative", () => packageRoot],
    ["expo", expoOnlyRoot],
  ];

  it("measures both preset branches", () => {
    // Guards the fingerprints against measuring nothing: the Flow-enum plugin is the
    // one whose addition required version 4, and the Expo root must take Expo's preset.
    expect(fingerprintOf(packageRoot).plugins).toContain("babel-plugin-transform-flow-enums");
    expect(fingerprintOf(expoOnlyRoot()).presets.map(([name]) => name)).toEqual(["expo"]);
  });

  it.each(branches)(
    "records a fingerprint of the %s branch's Babel options for this TRANSFORM_CACHE_VERSION",
    (branch, rootFor) => {
      const { normalised, fingerprint } = fingerprintOf(rootFor());
      const recorded = OPTION_FINGERPRINTS[TRANSFORM_CACHE_VERSION]?.[branch];
      const reused = Object.entries(OPTION_FINGERPRINTS).find(
        ([version, value]) =>
          value[branch] === fingerprint && Number(version) !== TRANSFORM_CACHE_VERSION,
      );
      expect(reused, "these options were already recorded under another version").toBeUndefined();
      expect(
        fingerprint,
        recorded === undefined
          ? `no ${branch} fingerprint recorded for TRANSFORM_CACHE_VERSION ${TRANSFORM_CACHE_VERSION}: add ${branch}: "${fingerprint}"`
          : `the transform's Babel options (${branch} preset) changed under TRANSFORM_CACHE_VERSION ${TRANSFORM_CACHE_VERSION}, so warm caches would keep the old output. Bump it in src/native/transform.mjs and add a row ${TRANSFORM_CACHE_VERSION + 1} with ${branch}: "${fingerprint}". Options: ${JSON.stringify(normalised)}`,
      ).toBe(recorded);
    },
  );
});
