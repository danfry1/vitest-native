import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Module from "node:module";
import os from "node:os";
import path from "node:path";

// `enableV8CompileCache` reads `nodeModule.enableCompileCache` at call time, so we
// drive its three branches by swapping the real (singleton) `Module.enableCompileCache`
// and re-importing the module fresh each test — its module-scope `_enabled` guard is
// sticky, so `vi.resetModules()` is what lets each case start from a clean slate.
// Swapping also prevents these tests from actually enabling the cache on the test
// process.
const EXPECTED_DIR = path.join(os.tmpdir(), "vitest-native-cache-v8");

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

  it("enables the cache once, under the vitest-native-cache-v8 tmp dir", async () => {
    const dirs: string[] = [];
    (Module as unknown as Record<string, unknown>).enableCompileCache = (dir: string) => {
      dirs.push(dir);
      return { status: 1, directory: dir };
    };
    const enableV8CompileCache = await load();

    enableV8CompileCache();
    enableV8CompileCache(); // idempotent: the per-realm guard suppresses the second call

    expect(dirs).toEqual([EXPECTED_DIR]);
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
