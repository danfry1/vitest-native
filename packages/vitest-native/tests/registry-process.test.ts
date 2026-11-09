import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error — internal runtime .mjs, intentionally not public API
import {
  _resetFailedRegistries,
  _setRegistryBuildOptions,
  buildRegistryFor,
  compileRegistryInChild,
  isCI,
  registryWaitForced,
  settleRegistryBuilds,
  startRegistryBuild,
} from "../src/native/registry-process.mjs";
import { reactNative } from "../src/index.js";
import { runPluginConfig } from "./plugin-config.js";
import { contextOf } from "./project-context-helpers.js";
// @ts-expect-error — internal runtime .mjs, intentionally not public API
import { lowerPriority } from "../src/native/bounded-process.mjs";
// @ts-expect-error — internal runtime .mjs, intentionally not public API
import { registryKey } from "../src/native/registry.mjs";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vn-registry-process-"));
afterAll(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

function compiler(name: string, source: string): string {
  const file = path.join(fixtureRoot, `${name}.mjs`);
  fs.writeFileSync(file, source);
  return file;
}

const respond = `
  import fs from "node:fs";
  const options = JSON.parse(fs.readFileSync(0, "utf8"));
  fs.writeSync(3, JSON.stringify({
    ok: true,
    registryFile: options.registryFile,
    received: options,
  }));
`;

describe("bounded registry compiler process", () => {
  it("keeps a production warm cache hit spawn-free", async () => {
    const root = fs.mkdtempSync(path.join(fixtureRoot, "warm-"));
    const nodeModules = path.join(root, "node_modules");
    fs.mkdirSync(nodeModules);
    const manifestFile = path.join(root, "package.json");
    fs.writeFileSync(manifestFile, JSON.stringify({ name: "warm-cache" }));
    const options = {
      projectRoot: root,
      platform: "ios",
      reactNativeVersion: "0.87.0",
      assetExts: ["png"],
      diagnostics: false,
    };
    const key = registryKey(options) as string;
    const registryDir = path.join(nodeModules, ".cache", "vitest-native", "registry");
    fs.mkdirSync(registryDir, { recursive: true });
    const registryFile = path.join(registryDir, `rn-ios-${key}.cjs`);
    fs.writeFileSync(registryFile, "module.exports = {};\n");
    const stat = fs.statSync(manifestFile);
    fs.writeFileSync(
      `${registryFile}.json`,
      JSON.stringify({ key, count: 1, manifest: [[manifestFile, stat.mtimeMs, stat.size]] }),
    );
    let compilerCalls = 0;

    const result = await buildRegistryFor(options, async () => {
      compilerCalls++;
      throw new Error("warm cache launched the compiler");
    });

    expect(result).toEqual({ registry: registryFile, libraryRegistry: null });

    // A library entry that does not resolve keeps React Native's warm registry, and
    // launches nothing: a build would fail the same way.
    const withLibrary = await buildRegistryFor(
      { ...options, libraryEntries: ["not-installed-library"] },
      async () => {
        compilerCalls++;
        throw new Error("an unresolvable library entry launched the compiler");
      },
    );
    expect(withLibrary).toEqual({ registry: registryFile, libraryRegistry: null });
    expect(compilerCalls).toBe(0);
  });

  it("uses a private protocol channel so compiler stdout cannot corrupt the result", async () => {
    const file = compiler(
      "success-with-stdout",
      `process.stdout.write("third-party compiler notice\\n");${respond}`,
    );
    const result = await compileRegistryInChild(file, { registryFile: "/cache/rn.cjs" });

    expect(result).toMatchObject({
      ok: true,
      registryFile: "/cache/rn.cjs",
      received: { registryFile: "/cache/rn.cjs" },
      heapMb: 96,
      attempts: 1,
    });
  });

  it("does not retry an ordinary compiler failure", async () => {
    const file = compiler(
      "ordinary-failure",
      `
        import fs from "node:fs";
        fs.readFileSync(0, "utf8");
        fs.writeSync(3, JSON.stringify({ ok: false, error: "bad transform" }));
        process.exitCode = 1;
      `,
    );
    const result = await compileRegistryInChild(file, {});

    expect(result).toMatchObject({
      ok: false,
      oom: false,
      error: "bad transform",
      heapMb: 96,
      attempts: 1,
    });
  });

  it("retries exactly once at the larger cap after a genuine V8 heap OOM", async () => {
    const file = compiler(
      "oom-then-success",
      `
        import fs from "node:fs";
        fs.readFileSync(0, "utf8");
        const heap = Number(process.execArgv[0].split("=")[1]);
        if (heap < 64) {
          process.stderr.write("FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\\n");
          process.exitCode = 1;
        } else {
          fs.writeSync(3, JSON.stringify({ ok: true, registryFile: "/cache/retry.cjs" }));
        }
      `,
    );
    const result = await compileRegistryInChild(file, {}, { initialHeapMb: 32, retryHeapMb: 64 });

    expect(result).toMatchObject({
      ok: true,
      registryFile: "/cache/retry.cjs",
      heapMb: 64,
      attempts: 2,
    });
  });

  it("kills and reports a compiler that exceeds its deadline", async () => {
    const file = compiler(
      "timeout",
      `
        import fs from "node:fs";
        fs.readFileSync(0, "utf8");
        setInterval(() => {}, 1_000);
      `,
    );
    const result = await compileRegistryInChild(file, {}, { timeoutMs: 100 });

    expect(result).toMatchObject({ ok: false, oom: false, attempts: 1 });
    expect(result.error).toContain("exceeded 100ms");
  });

  it("turns a synchronous spawn failure into a structured result", async () => {
    const result = await compileRegistryInChild(
      "ignored.mjs",
      {},
      {
        spawnProcess() {
          throw new Error("spawn unavailable");
        },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      oom: false,
      error: "spawn unavailable",
      attempts: 1,
    });
  });
});

describe("background registry build", () => {
  // A project whose cache misses: no metadata has been published for its key.
  function coldOptions(name: string) {
    const root = fs.mkdtempSync(path.join(fixtureRoot, `${name}-`));
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name }));
    return { projectRoot: root, platform: "ios", reactNativeVersion: "0.0.0", diagnostics: false };
  }

  /** A compiler that runs until it is aborted, or until `finish` is called. */
  function heldCompiler() {
    const calls: { signal?: AbortSignal; priority?: number }[] = [];
    let finish = () => {};
    const run = (
      _file: string,
      _options: unknown,
      control: { signal?: AbortSignal; priority?: number },
    ) => {
      calls.push(control);
      return new Promise<{ ok: boolean; cancelled?: boolean; error?: string }>((resolve) => {
        finish = () => resolve({ ok: false, error: "finished without a registry" });
        control.signal?.addEventListener("abort", () => resolve({ ok: false, cancelled: true }));
      });
    };
    return { compiler: run, calls, finish: () => finish() };
  }

  it("falls back at once for an entry whose compile already failed in this process", async () => {
    // #689: every later project or reload compiled again, each up to its timeout.
    const options = coldOptions("failed-once");
    const failing = vi.fn(async () => ({ ok: false, error: "compiler exceeded 120000ms" }));
    expect(await buildRegistryFor(options, failing)).toBeNull();
    expect(failing).toHaveBeenCalledTimes(1);
    const again = vi.fn(async () => ({ ok: true, registryFile: "unused" }));
    expect(await buildRegistryFor(options, again)).toBeNull();
    expect(startRegistryBuild(options, again)).toEqual({});
    expect(again).not.toHaveBeenCalled();
  });

  it("records a background failure too, so a later wait does not compile again", async () => {
    const options = coldOptions("failed-background");
    const held = heldCompiler();
    startRegistryBuild(options, held.compiler);
    held.finish();
    await settleRegistryBuilds(1000);
    const again = vi.fn(async () => ({ ok: true, registryFile: "unused" }));
    expect(await buildRegistryFor(options, again)).toBeNull();
    expect(again).not.toHaveBeenCalled();
  });

  it("returns at once on a miss, at the lowest priority, and shares one compiler per entry", async () => {
    const options = coldOptions("shared");
    const held = heldCompiler();
    const first = startRegistryBuild(options, held.compiler);
    const second = startRegistryBuild(options, held.compiler);
    expect(first.pending?.file).toMatch(/rn-ios-[0-9a-f]+\.cjs$/);
    expect(second.pending).toEqual(first.pending);
    expect(held.calls).toHaveLength(1);
    expect(held.calls[0].priority).toBe(19);
    await settleRegistryBuilds(0);
    expect(held.calls[0].signal?.aborted).toBe(true);
  });

  it("stops a running build at once when the closing run was cancelled", async () => {
    const held = heldCompiler();
    startRegistryBuild(coldOptions("ci"), held.compiler);
    const started = Date.now();
    await settleRegistryBuilds(60_000, { cancelled: true });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(held.calls[0].signal?.aborted).toBe(true);
  });

  it("lets a build finish within the close budget, and stops one that outlasts it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const finishing = heldCompiler();
      startRegistryBuild(coldOptions("finishing"), finishing.compiler);
      setTimeout(finishing.finish, 50);
      await settleRegistryBuilds(60_000);
      expect(finishing.calls[0].signal?.aborted).toBe(false);

      const outlasting = heldCompiler();
      startRegistryBuild(coldOptions("outlasting"), outlasting.compiler);
      const started = Date.now();
      await settleRegistryBuilds(100);
      expect(Date.now() - started).toBeGreaterThanOrEqual(90);
      expect(outlasting.calls[0].signal?.aborted).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("lets a waiting build join a background build of the same entry", async () => {
    const options = coldOptions("joined");
    const held = heldCompiler();
    startRegistryBuild(options, held.compiler);
    let compiles = 0;
    const waiting = buildRegistryFor(options, async () => {
      compiles++;
      return { ok: false, error: "compiled twice" };
    });
    // The background compiler publishes the entry, as the real one does.
    const key = registryKey(options) as string;
    const registryDir = path.join(
      options.projectRoot,
      "node_modules",
      ".cache",
      "vitest-native",
      "registry",
    );
    fs.mkdirSync(registryDir, { recursive: true });
    const registryFile = path.join(registryDir, `rn-ios-${key}.cjs`);
    fs.writeFileSync(registryFile, "module.exports = {};\n");
    const manifestFile = path.join(options.projectRoot, "package.json");
    const stat = fs.statSync(manifestFile);
    fs.writeFileSync(
      `${registryFile}.json`,
      JSON.stringify({ key, count: 1, manifest: [[manifestFile, stat.mtimeMs, stat.size]] }),
    );
    held.finish();
    expect(await waiting).toEqual({ registry: registryFile, libraryRegistry: null });
    expect(compiles).toBe(0);
  });

  it("compiles after joining a background build that did not build this caller's library registry", async () => {
    const options = coldOptions("joined-library");
    const library = path.join(options.projectRoot, "node_modules", "vn-joined-library");
    fs.mkdirSync(library);
    fs.writeFileSync(
      path.join(library, "package.json"),
      JSON.stringify({ name: "vn-joined-library" }),
    );
    fs.writeFileSync(path.join(library, "index.js"), "module.exports = 1;\n");
    const held = heldCompiler();
    // Started for a project without library entries.
    startRegistryBuild(options, held.compiler);
    let compiles = 0;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const waiting = buildRegistryFor(
        { ...options, libraryEntries: ["vn-joined-library"] },
        async () => {
          compiles++;
          return { ok: false, error: "no compiler in this test" };
        },
      );
      const key = registryKey(options) as string;
      const registryDir = path.join(
        options.projectRoot,
        "node_modules",
        ".cache",
        "vitest-native",
        "registry",
      );
      fs.mkdirSync(registryDir, { recursive: true });
      const registryFile = path.join(registryDir, `rn-ios-${key}.cjs`);
      fs.writeFileSync(registryFile, "module.exports = {};\n");
      const manifestFile = path.join(options.projectRoot, "package.json");
      const stat = fs.statSync(manifestFile);
      fs.writeFileSync(
        `${registryFile}.json`,
        JSON.stringify({ key, count: 1, manifest: [[manifestFile, stat.mtimeMs, stat.size]] }),
      );
      held.finish();
      expect(await waiting).toEqual({ registry: registryFile, libraryRegistry: null });
      expect(compiles).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("returns a warm hit without compiling, and asks to wait when only the library registry is missing", () => {
    const options = coldOptions("warm-library");
    const key = registryKey(options) as string;
    const registryDir = path.join(
      options.projectRoot,
      "node_modules",
      ".cache",
      "vitest-native",
      "registry",
    );
    fs.mkdirSync(registryDir, { recursive: true });
    const registryFile = path.join(registryDir, `rn-ios-${key}.cjs`);
    fs.writeFileSync(registryFile, "module.exports = {};\n");
    const manifestFile = path.join(options.projectRoot, "package.json");
    const stat = fs.statSync(manifestFile);
    fs.writeFileSync(
      `${registryFile}.json`,
      JSON.stringify({ key, count: 1, manifest: [[manifestFile, stat.mtimeMs, stat.size]] }),
    );
    const library = path.join(options.projectRoot, "node_modules", "vn-warm-library");
    fs.mkdirSync(library);
    fs.writeFileSync(
      path.join(library, "package.json"),
      JSON.stringify({ name: "vn-warm-library" }),
    );
    fs.writeFileSync(path.join(library, "index.js"), "module.exports = 1;\n");
    const held = heldCompiler();

    expect(startRegistryBuild(options, held.compiler)).toEqual({
      registry: registryFile,
      libraryRegistry: null,
    });
    // React Native's registry is warm and the library registry is not built: the caller
    // builds it before the run (buildRegistryFor), so nothing compiles in the background.
    expect(
      startRegistryBuild({ ...options, libraryEntries: ["vn-warm-library"] }, held.compiler),
    ).toEqual({ wait: true });
    expect(held.calls).toHaveLength(0);
  });

  it("recognises CI from CI or a provider's variable, unless CI=false", () => {
    expect(isCI({})).toBe(false);
    expect(isCI({ CI: "true" })).toBe(true);
    expect(isCI({ CI: "1" })).toBe(true);
    expect(isCI({ GITHUB_ACTIONS: "true" })).toBe(true);
    expect(isCI({ BUILDKITE: "true" })).toBe(true);
    // Generic build counters are not taken as CI.
    expect(isCI({ BUILD_NUMBER: "7", RUN_ID: "1" })).toBe(false);
    // CI=false turns it off, whatever else is set.
    expect(isCI({ CI: "false", GITHUB_ACTIONS: "true" })).toBe(false);
  });
});

describe("internal test seams", () => {
  // tests/support/registry-wait.setup.ts sets { wait: true } for this suite.
  const restore = () => _setRegistryBuildOptions({ wait: true });

  it("forces a wait only when a test asks", () => {
    try {
      _setRegistryBuildOptions({});
      expect(registryWaitForced()).toBe(false);
      _setRegistryBuildOptions({ wait: true });
      expect(registryWaitForced()).toBe(true);
    } finally {
      restore();
    }
  });

  it("hands the compiler its hold only when a test sets one", async () => {
    const root = fs.mkdtempSync(path.join(fixtureRoot, "hold-"));
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "hold" }));
    const options = {
      projectRoot: root,
      platform: "ios",
      reactNativeVersion: "0.0.0",
      diagnostics: false,
    };
    const inputs: Record<string, unknown>[] = [];
    const record = async (_file: string, input: Record<string, unknown>) => {
      inputs.push(input);
      return { ok: false, error: "recorded" };
    };
    try {
      _setRegistryBuildOptions({});
      await buildRegistryFor(options, record);
      // The first compile failed, and a failed entry is not compiled again in this
      // process: clear that, as this test is about what the compiler is handed.
      _resetFailedRegistries();
      _setRegistryBuildOptions({ compilerDelayMs: 1234 });
      await buildRegistryFor(options, record);
    } finally {
      restore();
    }
    expect(inputs).toHaveLength(2);
    expect("testDelayMs" in inputs[0]).toBe(false);
    expect(inputs[1].testDelayMs).toBe(1234);
  });
});

describe("lowerPriority", () => {
  const refusal = (code: string) =>
    Object.assign(new Error(`uv_os_setpriority returned ${code}`), {
      code: "ERR_SYSTEM_ERROR",
      info: { code },
    });

  it("lowers the priority", () => {
    const set = vi.fn();
    expect(lowerPriority(42, 19, set)).toBe(true);
    expect(set).toHaveBeenCalledWith(42, 19);
  });

  it.each(["EACCES", "EPERM", "ESRCH", "ENOSYS"])(
    "leaves the default when refused (%s)",
    (code) => {
      expect(
        lowerPriority(42, 19, () => {
          throw refusal(code);
        }),
      ).toBe(false);
    },
  );

  it("throws any other error", () => {
    expect(() =>
      lowerPriority(42, 19, () => {
        throw refusal("EINVAL");
      }),
    ).toThrow(/EINVAL/);
    expect(() =>
      lowerPriority(42, 19, () => {
        throw new TypeError("bad pid");
      }),
    ).toThrow(TypeError);
  });
});

describe("the plugin on a cold cache", () => {
  // A project of its own, so its registry is cold: React Native and the toolchain the
  // compiler needs, linked from this package.
  const projectWithReactNative = () => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-cold-plugin-"));
    const require = createRequire(path.join(process.cwd(), "package.json"));
    for (const name of ["react", "react-native", "@babel/core", "@react-native/babel-preset"]) {
      const link = path.join(root, "node_modules", ...name.split("/"));
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(
        path.dirname(require.resolve(`${name}/package.json`)),
        link,
        process.platform === "win32" ? "junction" : "dir",
      );
    }
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "cold", private: true }),
    );
    return root;
  };
  const SERVE_ENV = { command: "serve", mode: "test" } as const;

  it("waits for the build when a test forces it, and starts it in the background otherwise", async () => {
    const root = projectWithReactNative();
    try {
      vi.stubEnv("CI", "false");
      _setRegistryBuildOptions({});
      // Per file: the hot runtime (the default since 0.16) always waits, since a hot worker
      // keeps React Native resident from its first file.
      const background = contextOf(
        await runPluginConfig(
          reactNative({ engine: "native", hotRuntime: false }) as any,
          { root },
          SERVE_ENV,
        ),
      );
      expect(background.registryPending).toBeDefined();
      expect(background.registry).toBeUndefined();
      await settleRegistryBuilds(0, { cancelled: true });
      _setRegistryBuildOptions({ wait: true });
      const waited = contextOf(
        await runPluginConfig(reactNative({ engine: "native" }) as any, { root }, SERVE_ENV),
      );
      // Waited: no build left pending. (Whether this suite's workers can use the result is
      // another matter: their react-native is the mock engine's virtual module, see
      // tests/support/registry-wait.setup.ts, so the build is checked by mode, not by its file.)
      expect(waited.registryPending).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      _setRegistryBuildOptions({ wait: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
