import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Module from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `enableV8CompileCache` reads `nodeModule.enableCompileCache` at call time, so we
// drive its three branches by swapping the real (singleton) `Module.enableCompileCache`
// and re-importing the module fresh each test — its module-scope `_enabled` guard is
// sticky, so `vi.resetModules()` is what lets each case start from a clean slate.
// Swapping also prevents these tests from actually enabling the cache on the test
// process.
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
// Colocated with the transform cache under the project's node_modules/.cache.
const EXPECTED_DIR = path.join(projectRoot, "node_modules", ".cache", "vitest-native", "v8");
const FALLBACK_DIR = path.join(os.tmpdir(), "vitest-native-cache", "v8");

describe("enableV8CompileCache", () => {
  let original: unknown;

  beforeEach(() => {
    original = (Module as unknown as Record<string, unknown>).enableCompileCache;
    vi.resetModules();
  });

  afterEach(() => {
    (Module as unknown as Record<string, unknown>).enableCompileCache = original;
  });

  async function load() {
    // @ts-expect-error — runtime .mjs, no types
    return (await import("../src/native/compile-cache.mjs")).enableV8CompileCache;
  }

  it("enables the cache once, colocated with the transform cache", async () => {
    const dirs: string[] = [];
    (Module as unknown as Record<string, unknown>).enableCompileCache = (dir: string) => {
      dirs.push(dir);
      return { status: 1, directory: dir };
    };
    const enableV8CompileCache = await load();

    enableV8CompileCache(projectRoot);
    enableV8CompileCache(projectRoot); // idempotent: the per-realm guard suppresses the second call

    expect(dirs).toEqual([EXPECTED_DIR]);
  });

  it("falls back to the tmpdir root when no project root is supplied", async () => {
    const dirs: string[] = [];
    (Module as unknown as Record<string, unknown>).enableCompileCache = (dir: string) => {
      dirs.push(dir);
      return { status: 1, directory: dir };
    };
    const enableV8CompileCache = await load();

    enableV8CompileCache();

    expect(dirs).toEqual([FALLBACK_DIR]);
  });

  it("is a no-op when the API is absent (Node < 22.8)", async () => {
    (Module as unknown as Record<string, unknown>).enableCompileCache = undefined;
    const enableV8CompileCache = await load();

    expect(() => enableV8CompileCache()).not.toThrow();
  });

  it("swallows a throwing enableCompileCache (read-only tmp, unsupported platform)", async () => {
    (Module as unknown as Record<string, unknown>).enableCompileCache = () => {
      throw new Error("EROFS: read-only file system");
    };
    const enableV8CompileCache = await load();

    expect(() => enableV8CompileCache()).not.toThrow();
  });
});
