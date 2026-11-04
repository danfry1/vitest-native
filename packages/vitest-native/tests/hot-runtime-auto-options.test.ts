// `hotRuntime: { mode: 'auto', … }`: hot with the object's recycling options where the
// run can be bounded, per-file isolation with the usual warning where it cannot. The
// plain 'auto' and the object form without `mode` are pinned in native-unit.test.ts;
// this file pins the combination: every fallback 'auto' takes, and the threshold applied.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { reactNative } from "../src/index.js";
import { runPluginConfig } from "./plugin-config.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(HERE, "..");
const SERVE_ENV = { command: "serve", mode: "test" } as const;
const GIB = 1024 ** 3;
const LIMIT = 2 * GIB;

describe("hotRuntime option types", () => {
  it("accepts mode: 'auto' with the recycling options and rejects other modes", () => {
    const tsc = path.join(packageRoot, "node_modules", ".bin", "tsc");
    const result = spawnSync(tsc, ["-p", path.join(HERE, "types", "tsconfig.json")], {
      encoding: "utf8",
    });
    expect(`${result.stdout}${result.stderr}`).toBe("");
    expect(result.status).toBe(0);
  });
});

describe("hotRuntime mode validation", () => {
  it("rejects a mode other than 'auto'", () => {
    expect(() => reactNative({ hotRuntime: { mode: "on" } } as any)).toThrow(
      /"hotRuntime\.mode" must be "auto"/,
    );
    expect(() => reactNative({ hotRuntime: { mode: true } } as any)).toThrow(/hotRuntime\.mode/);
  });

  it("rejects mode: 'auto' with allowUnboundedMemory, which contradict each other", () => {
    expect(() =>
      reactNative({ hotRuntime: { mode: "auto", allowUnboundedMemory: true } } as any),
    ).toThrow(/allowUnboundedMemory.*cannot be combined with mode: "auto"/s);
    expect(() =>
      reactNative({ hotRuntime: { mode: "auto", allowUnboundedMemory: false } }),
    ).not.toThrow();
  });

  it("validates the recycling options beside mode as it does without it", () => {
    expect(() => reactNative({ hotRuntime: { mode: "auto", memoryLimit: -1 } } as any)).toThrow(
      /memoryLimit.*non-negative/s,
    );
    expect(() => reactNative({ hotRuntime: { mode: "auto", memoryLimt: 1 } } as any)).toThrow(
      /Unknown hotRuntime option "memoryLimt". Did you mean 'memoryLimit'\?/,
    );
  });
});

describe("hotRuntime: { mode: 'auto', memoryLimit }", () => {
  // A project with React Native and no registry, as in native-unit.test.ts's routing
  // tests: config() reads only the config there, about 3 ms a call.
  let hotRoot: string;
  beforeAll(() => {
    hotRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-hot-auto-options-"));
    for (const name of ["react-native", "@react-native/babel-preset", "@babel/core", "vitest"]) {
      const to = path.join(hotRoot, "node_modules", name);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.symlinkSync(fs.realpathSync(path.join(packageRoot, "node_modules", name)), to, "junction");
    }
    fs.writeFileSync(path.join(hotRoot, "package.json"), JSON.stringify({ name: "app" }));
    vi.stubEnv("VITEST_NATIVE_NO_REGISTRY", "1");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    fs.rmSync(hotRoot, { recursive: true, force: true, maxRetries: 5 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const autoWithLimit = () =>
    reactNative({ engine: "native", hotRuntime: { mode: "auto", memoryLimit: LIMIT } }) as any;
  const poolWorker = (pool: any) =>
    pool.createPoolWorker({
      distPath: "/tmp/unused",
      project: {
        vitest: { logger: { outputStream: process.stdout, errorStream: process.stderr } },
      },
      method: "run",
      environment: { name: "node", options: null },
      execArgv: [],
      env: {},
    });

  it("runs hot with the given heap threshold where the plan allows", async () => {
    const config = await runPluginConfig(
      autoWithLimit(),
      { root: hotRoot, test: { maxWorkers: 2 } },
      SERVE_ENV,
    );
    expect(config.test.isolate).toBe(false);
    expect(config.test.pool).toMatchObject({ name: "vitest-native" });
    const worker = poolWorker(config.test.pool);
    expect(worker.reportMemory).toBe(true);
    expect(worker.memoryLimit).toBe(LIMIT);
    // The plan's own threshold, for contrast, is what plain 'auto' uses.
    const plain = await runPluginConfig(
      reactNative({ engine: "native", hotRuntime: "auto" }) as any,
      { root: hotRoot, test: { maxWorkers: 2 } },
      SERVE_ENV,
    );
    const plan = JSON.parse(plain.test.env.VITEST_NATIVE_MEMORY_PLAN);
    expect(poolWorker(plain.test.pool).memoryLimit).toBe(plan.workerHeapLimit);
    expect(plan.workerHeapLimit).not.toBe(LIMIT);
  });

  it("keeps the given threshold when Vitest's worker count rebuilds the plan", async () => {
    const plugin = autoWithLimit();
    const cfg = await runPluginConfig(
      plugin,
      { root: hotRoot, test: { maxWorkers: 2 } },
      SERVE_ENV,
    );
    const config = { root: hotRoot, ...cfg.test, pool: "vitest-native", maxWorkers: 3 };
    plugin.configureVitest({ vitest: { _cliOptions: {} }, project: { config } });
    expect(config.isolate).toBe(false);
    expect(poolWorker(cfg.test.pool).memoryLimit).toBe(LIMIT);
  });

  it("falls back to per-file isolation, with a warning, where hot cannot be bounded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cases = [
      { label: "maxWorkers: 1", test: { maxWorkers: 1 }, reason: /one unrecyclable worker/ },
      {
        label: "fileParallelism: false",
        test: { fileParallelism: false },
        reason: /one unrecyclable worker/,
      },
      {
        label: "test.isolate",
        test: { maxWorkers: 2, isolate: true },
        reason: /test\.isolate is explicitly true/,
      },
      {
        label: "test.pool",
        test: { maxWorkers: 2, pool: "forks" },
        reason: /'forks' is explicitly configured/,
      },
    ];
    for (const fallback of cases) {
      warn.mockClear();
      const config = await runPluginConfig(
        autoWithLimit(),
        { root: hotRoot, test: fallback.test },
        SERVE_ENV,
      );
      expect(config.test.isolate, fallback.label).toBeUndefined();
      expect(config.test.pool, fallback.label).not.toMatchObject({ name: "vitest-native" });
      expect(config.test.env.VITEST_NATIVE_MEMORY_PLAN, fallback.label).toBeUndefined();
      expect(warn, fallback.label).toHaveBeenCalledWith(
        expect.stringMatching(/kept default isolation/),
      );
      expect(String(warn.mock.calls.at(-1)?.[0]), fallback.label).toMatch(fallback.reason);
    }
  });

  it("falls back where host memory admits only one worker", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(os, "totalmem").mockReturnValue(GIB);
    vi.spyOn(process, "constrainedMemory").mockReturnValue(0);
    const config = await runPluginConfig(
      autoWithLimit(),
      { root: hotRoot, test: { maxWorkers: 4 } },
      SERVE_ENV,
    );
    expect(config.test.isolate).toBeUndefined();
    expect(config.test.pool).toBe("threads");
  });

  it("falls back, without throwing, on --pool, --isolate and --maxWorkers=1", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [cli, reason] of [
      [{ pool: "forks" }, /the pool 'forks' was set/],
      [{ isolate: true }, /--isolate was passed/],
      [{ isolate: false }, /--no-isolate was passed/],
      [{ maxWorkers: 1 }, /maxWorkers is 1/],
    ] as const) {
      error.mockClear();
      const plugin = autoWithLimit();
      const cfg = await runPluginConfig(
        plugin,
        { root: hotRoot, test: { maxWorkers: 3 } },
        SERVE_ENV,
      );
      const config: Record<string, any> = { root: hotRoot, ...cfg.test, pool: "vitest-native" };
      Object.assign(config, cli);
      expect(() =>
        plugin.configureVitest({ vitest: { _cliOptions: cli }, project: { config } }),
      ).not.toThrow();
      expect(config.runner, JSON.stringify(cli)).toBeUndefined();
      expect(config.env.VITEST_NATIVE_MEMORY_PLAN).toBeUndefined();
      expect(error).toHaveBeenCalledWith(expect.stringMatching(reason));
    }
  });

  it("without mode, the object form still requires the hot runtime", async () => {
    const required = () =>
      reactNative({ engine: "native", hotRuntime: { memoryLimit: LIMIT } }) as any;
    await expect(
      runPluginConfig(required(), { root: hotRoot, test: { maxWorkers: 1 } }, SERVE_ENV),
    ).rejects.toThrow(/HOT_MEMORY_UNBOUNDED|one worker/);
    await expect(
      runPluginConfig(
        required(),
        { root: hotRoot, test: { maxWorkers: 2, pool: "forks" } },
        SERVE_ENV,
      ),
    ).rejects.toThrow(/HOT_RUNTIME_OVERRIDDEN|cannot honour/);
  });
});
