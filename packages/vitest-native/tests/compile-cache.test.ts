import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Module from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `enableV8CompileCache` reads `nodeModule.enableCompileCache` at call time, so we
// drive its three branches by swapping the real (singleton) `Module.enableCompileCache`
// and re-importing the module fresh each test. The once-per-thread decision lives on
// the global object, so each case clears it to start from a clean slate. Swapping
// also prevents these tests from actually enabling the cache on the test process.
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
const DECIDED = "__vitest_native_v8_compile_cache";

describe("enableV8CompileCache", () => {
  let original: unknown;

  beforeEach(() => {
    original = (Module as unknown as Record<string, unknown>).enableCompileCache;
    delete (globalThis as Record<string, unknown>)[DECIDED];
    // The first pool worker, which enables the cache whether or not it holds entries.
    vi.stubEnv("VITEST_POOL_ID", "1");
    vi.resetModules();
  });

  afterEach(() => {
    (Module as unknown as Record<string, unknown>).enableCompileCache = original;
    delete (globalThis as Record<string, unknown>)[DECIDED];
    vi.unstubAllEnvs();
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
    enableV8CompileCache(projectRoot); // idempotent: the first call in a thread decides

    expect(dirs).toEqual([EXPECTED_DIR]);
  });

  it("leaves the cache off when the first call skips it, even for a second copy of the module", async () => {
    const dirs: string[] = [];
    (Module as unknown as Record<string, unknown>).enableCompileCache = (dir: string) => {
      dirs.push(dir);
      return { status: 1, directory: dir };
    };
    const enableV8CompileCache = await load();

    // The hot worker decides first (ESM generation on), then the setup file calls
    // again, possibly through a separately evaluated copy of this module.
    enableV8CompileCache(projectRoot, { skip: true });
    vi.resetModules();
    const secondCopy = await load();
    secondCopy(projectRoot);

    expect(dirs).toEqual([]);
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

  describe("a cold cache is written by one worker (#831)", () => {
    let project: string;
    let v8Dir: string;
    beforeEach(() => {
      project = fs.mkdtempSync(path.join(os.tmpdir(), "vn-compile-cache-"));
      fs.mkdirSync(path.join(project, "node_modules"));
      v8Dir = path.join(project, "node_modules", ".cache", "vitest-native", "v8");
    });
    afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

    const entryFor = (build: string) => {
      fs.mkdirSync(path.join(v8Dir, build), { recursive: true });
      fs.writeFileSync(path.join(v8Dir, build, "672c096e"), "");
    };
    const thisNode = `v${process.versions.node}-${process.arch}-cf738c9d-501`;

    async function decide(poolId: string | undefined) {
      const dirs: string[] = [];
      (Module as unknown as Record<string, unknown>).enableCompileCache = (dir: string) => {
        dirs.push(dir);
        return { status: 1, directory: dir };
      };
      vi.stubEnv("VITEST_POOL_ID", poolId);
      const enableV8CompileCache = await load();
      enableV8CompileCache(project);
      return dirs;
    }

    it("enables a cold cache only in the first pool worker", async () => {
      expect(await decide("1")).toEqual([v8Dir]);
      delete (globalThis as Record<string, unknown>)[DECIDED];
      vi.resetModules();
      expect(await decide("2")).toEqual([]);
      expect((globalThis as Record<string, unknown>)[DECIDED]).toBe("off");
    });

    it("enables a cache that holds this Node's entries in every worker", async () => {
      entryFor(thisNode);
      expect(await decide("3")).toEqual([v8Dir]);
    });

    it("treats another Node's entries as a cold cache", async () => {
      entryFor(`v0.0.0-${process.arch}-cf738c9d-501`);
      fs.mkdirSync(path.join(v8Dir, thisNode), { recursive: true });
      expect(await decide("2")).toEqual([]);
    });

    it("makes the one thread outside a pool the writer", async () => {
      expect(await decide(undefined)).toEqual([v8Dir]);
    });
  });
});
