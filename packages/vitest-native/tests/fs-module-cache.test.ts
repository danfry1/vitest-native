import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  dependencyFingerprint,
  fsModuleCacheKey,
  shouldDefaultFsModuleCache,
} from "../src/fs-module-cache.js";
import { reactNative } from "../src/index.js";
import { runPluginConfig } from "./plugin-config.js";

// Vitest's own cache key ignores plugin versions and what a plugin reads from disk, so
// the plugin adds them. A stale entry would serve last version's transform silently.
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});
function dir(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-fs-cache-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

describe("dependencyFingerprint", () => {
  it("changes when the lockfile changes", () => {
    const root = dir({ "package.json": "{}", "package-lock.json": '{"a":1}' });
    const before = dependencyFingerprint(root);
    fs.writeFileSync(path.join(root, "package-lock.json"), '{"a":2}');
    expect(dependencyFingerprint(root)).not.toBe(before);
  });

  it("finds a workspace lockfile above a package", () => {
    const root = dir({ "pnpm-lock.yaml": "x: 1", "apps/app/package.json": "{}" });
    const app = path.join(root, "apps/app");
    const before = dependencyFingerprint(app);
    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "x: 2");
    expect(dependencyFingerprint(app)).not.toBe(before);
  });

  it("falls back to package.json without a lockfile", () => {
    const root = dir({ "package.json": '{"dependencies":{"a":"1"}}' });
    const before = dependencyFingerprint(root);
    fs.writeFileSync(path.join(root, "package.json"), '{"dependencies":{"a":"2"}}');
    expect(dependencyFingerprint(root)).not.toBe(before);
  });
});

describe("fsModuleCacheKey", () => {
  it("changes with this package's version, the plugin state and the dependencies", () => {
    const own = dir({ "package.json": '{"version":"1.0.0"}' });
    const project = dir({ "package.json": "{}", "bun.lock": "v1" });
    const base = fsModuleCacheKey(own, project, { platform: "ios" });
    expect(fsModuleCacheKey(own, project, { platform: "ios" })).toBe(base);
    expect(fsModuleCacheKey(own, project, { platform: "android" })).not.toBe(base);
    fs.writeFileSync(path.join(own, "package.json"), '{"version":"1.0.1"}');
    expect(fsModuleCacheKey(own, project, { platform: "ios" })).not.toBe(base);
    fs.writeFileSync(path.join(own, "package.json"), '{"version":"1.0.0"}');
    fs.writeFileSync(path.join(project, "bun.lock"), "v2");
    expect(fsModuleCacheKey(own, project, { platform: "ios" })).not.toBe(base);
  });
});

describe("shouldDefaultFsModuleCache", () => {
  it("turns the cache on under Vitest 5 only when the user has not chosen", () => {
    expect(shouldDefaultFsModuleCache(5, undefined)).toBe(true);
    expect(shouldDefaultFsModuleCache(5, {})).toBe(true);
    expect(shouldDefaultFsModuleCache(4, {})).toBe(false);
    expect(shouldDefaultFsModuleCache(Number.NaN, {})).toBe(false);
    expect(shouldDefaultFsModuleCache(5, { fsModuleCache: false })).toBe(false);
    expect(shouldDefaultFsModuleCache(5, { experimental: { fsModuleCache: false } })).toBe(false);
  });
});

describe("the plugin", () => {
  it("enables the cache by default on Vitest 5 and leaves an explicit choice alone", async () => {
    const on = await runPluginConfig(reactNative({ engine: "mock" }) as never, { test: {} });
    expect(on.test.fsModuleCache).toBe(true);
    const off = await runPluginConfig(reactNative({ engine: "mock" }) as never, {
      test: { fsModuleCache: false } as never,
    });
    expect(off.test.fsModuleCache).toBeUndefined();
  });

  it("registers its cache key with Vitest", async () => {
    const plugin = reactNative({ engine: "mock" }) as never as {
      configureVitest: (ctx: unknown) => void;
    };
    const resolved = await runPluginConfig(plugin as never, { test: {} });
    const generators: (() => string)[] = [];
    plugin.configureVitest({
      vitest: { config: {} },
      project: { config: { root: process.cwd(), setupFiles: resolved.test.setupFiles } },
      defineCacheKeyGenerator: (g: () => string) => generators.push(g),
    });
    expect(generators).toHaveLength(1);
    expect(generators[0]()).toMatch(/^[0-9a-f]{40}$/);
  });
});
