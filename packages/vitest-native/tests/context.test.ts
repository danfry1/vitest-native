// The project context (src/context.mjs): one validated, frozen description of a project
// that workers read instead of per-setting environment variables (ADR-0003).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTEXT_ENV,
  ESCAPE_HATCHES,
  assertBootContext,
  ensureProjectContext,
  markBootContext,
  projectContext,
  requireProjectContext,
  writeProjectContext,
} from "../src/context.mjs";
import { reactNative } from "../src/index.js";
import { runPluginConfig } from "./plugin-config.js";

const SRC = path.resolve(__dirname, "../src");
const base = { platform: "android" as const, diagnostics: false, projectRoot: path.resolve("/p") };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vn-context-"));
const fileOf = (ref: string) => ref.slice(0, ref.lastIndexOf("#"));

afterEach(() => vi.restoreAllMocks());

describe("the project context", () => {
  it("round-trips typed and frozen, read once per realm", () => {
    const ref = writeProjectContext({ ...base, transform: ["a-lib"], diagnostics: true }, tmp());
    const context = projectContext(ref)!;
    expect(context.transform).toEqual(["a-lib"]);
    expect(context.diagnostics).toBe(true);
    expect(Object.isFrozen(context.transform)).toBe(true);
    expect(projectContext(ref)).toBe(context);
  });

  it("is content-addressed, written 0600, with no temporary file left", () => {
    const root = tmp();
    const a = writeProjectContext(base, root);
    expect(writeProjectContext(base, root)).toBe(a);
    expect(writeProjectContext({ ...base, platform: "ios" }, root)).not.toBe(a);
    if (process.platform !== "win32") expect(fs.statSync(fileOf(a)).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(path.dirname(fileOf(a))).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("falls back to the temp directory when the cache cannot be written", () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, "contexts"));
    fs.chmodSync(path.join(root, "contexts"), 0o500);
    try {
      const ref = writeProjectContext({ ...base, reactNativeVersion: `ro-${Date.now()}` }, root);
      expect(fileOf(ref).startsWith(path.join(os.tmpdir(), "vitest-native-cache"))).toBe(true);
      expect(projectContext(ref)?.platform).toBe("android");
    } finally {
      fs.chmodSync(path.join(root, "contexts"), 0o700);
    }
  });

  it("tolerates another run having renamed the same file into place first", () => {
    const root = tmp();
    const real = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      real(from, to);
      throw Object.assign(new Error("EPERM"), { code: "EPERM" });
    });
    const ref = writeProjectContext({ ...base, reactNativeVersion: "race" }, root);
    expect(projectContext(ref)?.reactNativeVersion).toBe("race");
  });

  it("removes files older than a week when it writes", () => {
    const root = tmp();
    const old = writeProjectContext({ ...base, reactNativeVersion: "old" }, root);
    const week = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(fileOf(old), week, week);
    writeProjectContext({ ...base, reactNativeVersion: "new" }, root);
    expect(fs.existsSync(fileOf(old))).toBe(false);
  });

  it("is rewritten when the cache is cleared during a run", () => {
    const fields = { ...base, reactNativeVersion: "heal" };
    const ref = writeProjectContext(fields, tmp());
    fs.rmSync(path.dirname(fileOf(ref)), { recursive: true });
    ensureProjectContext(ref, fields);
    fs.writeFileSync(fileOf(ref), "{");
    ensureProjectContext(ref, fields);
    expect(JSON.parse(fs.readFileSync(fileOf(ref), "utf8")).fields).toEqual(fields);
  });

  it("returns null only when no reference is given", () => {
    expect(projectContext("")).toBeNull();
    expect(() => requireProjectContext("")).toThrow(/context is invalid \(missing\)/);
  });

  describe("fails by name, naming the cache path", () => {
    const write = () => writeProjectContext(base, tmp());
    const rewrite = (ref: string, edit: (doc: any) => void) => {
      const doc = JSON.parse(fs.readFileSync(fileOf(ref), "utf8"));
      edit(doc);
      fs.writeFileSync(fileOf(ref), JSON.stringify(doc));
    };
    it("a missing file", () => {
      const ref = write();
      fs.rmSync(fileOf(ref));
      expect(() => projectContext(ref)).toThrow(
        new RegExp(
          `\\(missing\\)[\\s\\S]*delete ${path.dirname(fileOf(ref)).replace(/[\\\\^$.*+?()[\]{}|]/g, "\\\\$&")}`,
        ),
      );
    });
    it("a reference without a key", () => {
      expect(() => projectContext("/nowhere.json")).toThrow(/\(missing\)/);
    });
    it("another version", () => {
      const ref = write();
      rewrite(ref, (doc) => (doc.version = 99));
      expect(() => projectContext(ref)).toThrow(/\(version\)/);
    });
    it("a file changed after it was written", () => {
      const ref = write();
      rewrite(ref, (doc) => (doc.fields.platform = "ios"));
      expect(() => projectContext(ref)).toThrow(/\(key\)/);
    });
    const mutations: Record<string, unknown> = {
      platform: "web",
      diagnostics: "yes",
      projectRoot: "relative",
      reactNativeVersion: 81,
      transform: "a-lib",
      sourceExts: [1],
      assetExts: {},
      hotPreserveGlobals: [null],
      hotEsmGeneration: "0",
      registry: "relative.cjs",
      ownership: [],
      projectDirs: "dir",
      requireAliases: [["one"]],
      requireAliasesSkipped: [1],
      presetNames: "x",
      presetConfig: [],
      presetExports: "x",
      presetModules: {},
      presetDisabled: [false],
      knownNativeModules: "Foo",
      nativeModuleSpecs: [],
      nativeModules: "everything",
      surprise: 1,
    };
    for (const [field, value] of Object.entries(mutations)) {
      it(`field ${field}`, () => {
        expect(() => writeProjectContext({ ...base, [field]: value } as never, tmp())).toThrow(
          new RegExp(`\\(schema: ${field}\\)`),
        );
      });
    }
  });
});

describe("one project per hot worker", () => {
  const handle = Symbol.for("vitest-native");
  afterEach(() => delete (globalThis as any)[handle]);

  it("a file from another project fails by name", () => {
    markBootContext("/a.json#a");
    expect(() => assertBootContext("/a.json#a")).not.toThrow();
    expect(() => assertBootContext("/b.json#b")).toThrow(
      /\(project\)[\s\S]*booted for \/a\.json#a/,
    );
  });

  it("the native setup file runs the check for every file, and the hot worker marks it", () => {
    const setup = fs.readFileSync(path.join(SRC, "native/setup.mjs"), "utf8");
    const worker = fs.readFileSync(path.join(SRC, "native/worker.mjs"), "utf8");
    expect(setup).toMatch(/^assertBootContext\(\);$/m);
    expect(worker).toMatch(/^markBootContext\(\);$/m);
  });
});

describe("the Vite side", () => {
  const configure = async (envRoot: string) => {
    const plugin = reactNative({ engine: "mock" }) as any;
    const own = await runPluginConfig(plugin, { root: process.cwd() });
    const other = await runPluginConfig(reactNative({ engine: "mock" }) as any, { root: envRoot });
    await plugin.configResolved({ root: process.cwd() });
    const project = {
      config: { root: process.cwd(), setupFiles: own.test.setupFiles, env: { ...other.test.env } },
    };
    return () => plugin.configureVitest({ vitest: { config: { cliOptions: {} } }, project });
  };

  it("refuses a project handed another project's context", async () => {
    const run = await configure(path.join(process.cwd(), "tests"));
    expect(run).toThrow(/context is invalid \(project\)[\s\S]*was handed the context for/);
  });

  it("accepts its own", async () => {
    const run = await configure(process.cwd());
    expect(run).not.toThrow();
  });
});

describe("variables the context replaced", () => {
  it("warns once, by name, when one is still set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("VITEST_NATIVE_PLATFORM", "android");
    try {
      vi.resetModules();
      const { reactNative: fresh } = await import("../src/index.js");
      await runPluginConfig(fresh({ engine: "mock" }), { root: process.cwd() });
      await runPluginConfig(fresh({ engine: "mock" }), { root: process.cwd() });
    } finally {
      vi.unstubAllEnvs();
    }
    const said = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes("no longer read"));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("VITEST_NATIVE_PLATFORM");
  });
});

describe("worker code reads no other VITEST_NATIVE_ names", () => {
  // Main-process modules, which may name the retired variables (to warn about them).
  const MAIN_PROCESS = new Set(["plugin.ts", "native/apply.ts", "native/pool.ts"]);
  const ALLOWED = new Set([CONTEXT_ENV, ...ESCAPE_HATCHES]);
  const NAME = /\bVITEST_NATIVE_[A-Z0-9_]+/g;
  const ENV_CONSTANT = /\b[A-Z][A-Z0-9_]*_ENV\b/g;
  const offences = (rel: string, source: string) => [
    ...[...source.matchAll(NAME)].filter((m) => !ALLOWED.has(m[0])).map((m) => `${rel}: ${m[0]}`),
    ...[...source.matchAll(ENV_CONSTANT)]
      .filter((m) => !["CONTEXT_ENV", "NODE_ENV", "BABEL_ENV", "HOT_WORKER_ENV"].includes(m[0]))
      .map((m) => `${rel}: ${m[0]}`),
  ];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(SRC);

  it("in any source file a worker loads, of any extension", () => {
    const found: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      if (MAIN_PROCESS.has(rel) || rel.startsWith("cli/")) continue;
      found.push(...offences(rel, fs.readFileSync(file, "utf8")));
    }
    expect(found).toEqual([]);
  });

  it("in the code the plugin generates for workers", async () => {
    const plugin = reactNative({ engine: "mock", diagnostics: true }) as any;
    await runPluginConfig(plugin, { root: process.cwd() });
    await plugin.configResolved({ root: process.cwd() });
    const ids = ["react-native-reanimated", "react-native-reanimated/lib/Unknown"]
      .map((source) => plugin.resolveId(source, undefined))
      .filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    const found = ids.flatMap((id: string) => offences(id, String(plugin.load(id) ?? "")));
    expect(found).toEqual([]);
  });

  it("can see a name or a constant (negative control)", () => {
    expect(offences("x", "process.env.VITEST_NATIVE_PLATFORM")).toHaveLength(1);
    expect(offences("x", 'const KNOWN_ENV = "x"; process.env[KNOWN_ENV]')).toHaveLength(2);
  });
});

describe("the ESM loader takes diagnostics from the context", () => {
  it("bakes the context's diagnostics into a preset subpath module", async () => {
    const loader = await import("../src/native/loader.mjs");
    const source = (diagnostics: boolean) => {
      loader.initialize({
        projectRoot: process.cwd(),
        presetExports: { "some-preset-lib": ["Thing"] },
        context: writeProjectContext({ ...base, projectRoot: process.cwd(), diagnostics }, tmp()),
      });
      return String(
        loader.loadSync("vitest-native-preset:some-preset-lib/lib/Missing", {}, () => {
          throw new Error("unreachable");
        }).source,
      );
    };
    expect(source(true)).toContain("if (!_hit && true)");
    expect(source(false)).toContain("if (!_hit && false)");
  });
});
