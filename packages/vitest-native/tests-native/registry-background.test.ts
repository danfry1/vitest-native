import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { CI_VARIABLES } from "../src/native/registry-process.mjs";

// On a cold cache the native engine starts the run without waiting for the precompiled
// registry: it compiles in a background child, test files that start before it lands
// load React Native file by file, and later ones use it (registry-process.mjs). These
// run real Vitest processes against a scratch project, each with its own cache.

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const posix = process.platform !== "win32";
const scratch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-registry-bg-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

// Each test file records whether its worker serves React Native from the registry,
// and whether the registry existed when it started. A file that started before the
// registry landed waits for it, so the next file starts after.
const probe = `
import fs from "node:fs";
import { Platform } from "react-native";
test("probe", async () => {
  expect(Platform.OS).toBe("ios");
  const dir = process.env.PROBE_META;
  const landed = () => fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(".cjs.json"));
  const before = !landed();
  if (process.env.PROBE_HOLD) {
    fs.writeFileSync(process.env.PROBE_HOLD, "started");
    // Held for good, or for PROBE_HOLD_MS.
    const ms = Number(process.env.PROBE_HOLD_MS);
    await new Promise((r) => ms > 0 && setTimeout(r, ms));
  }
  if (before && process.env.PROBE_WAIT) {
    for (let i = 0; i < 1200 && !landed(); i++) await new Promise((r) => setTimeout(r, 50));
  }
  fs.appendFileSync(process.env.PROBE_OUT, JSON.stringify({
    installed: globalThis.__vitest_native_registry_installed === true,
    before,
  }) + "\\n");
}, 90_000);
`;

const registryDir = (root: string) =>
  path.join(root, "node_modules", ".cache", "vitest-native", "registry");

/**
 * Holds the compiler before it starts: each scratch config passes it to the plugin's
 * internal test seam (registry-process.mjs, _setRegistryBuildOptions), which hands it
 * to the compiler child (registry-compiler.mjs).
 */
const DELAY = "PROBE_COMPILER_DELAY_MS";
const registryProcessUrl = pathToFileURL(
  path.join(packageRoot, "dist/native/registry-process.mjs"),
).href;

let count = 0;
function project(files = ["a.test.mjs"], test: Record<string, unknown> = {}) {
  const root = path.join(scratch, `p${count++}`);
  for (const name of ["react", "react-native", "@babel/core", "@react-native/babel-preset"]) {
    const link = path.join(root, "node_modules", ...name.split("/"));
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(
      path.dirname(require.resolve(`${name}/package.json`)),
      link,
      posix ? "dir" : "junction",
    );
  }
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "registry-bg", private: true, type: "module" }),
  );
  fs.writeFileSync(
    path.join(root, "vitest.config.mjs"),
    `import { reactNative } from ${JSON.stringify(pathToFileURL(path.join(packageRoot, "dist/index.mjs")).href)};\n` +
      `import { _setRegistryBuildOptions } from ${JSON.stringify(registryProcessUrl)};\n` +
      `_setRegistryBuildOptions({ compilerDelayMs: Number(process.env.${DELAY}) || 0 });\n` +
      `export default { plugins: [reactNative({ engine: "native" })], test: ${JSON.stringify({
        globals: true,
        include: ["*.test.mjs"],
        maxWorkers: 1,
        fileParallelism: false,
        teardownTimeout: 30_000,
        ...test,
      })} };\n`,
  );
  for (const file of files) fs.writeFileSync(path.join(root, file), probe);
  return { root, out: path.join(root, "out.jsonl") };
}

/** Whether a complete registry is in `root`'s cache: its metadata is published last. */
function published(root: string): boolean {
  const dir = registryDir(root);
  return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(".cjs.json"));
}

type Run = { code: number | null; signal: string | null; pid: number; output: string };

/** This process's environment without anything that would change how the run behaves. */
function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITEST") || key === "NODE_OPTIONS" || CI_VARIABLES.includes(key))
      delete env[key];
  }
  return env;
}

/** Every run this file starts, by pid (its process group), so none can outlive a test. */
const started = new Set<number>();
afterEach(() => {
  if (!posix) return;
  for (const pid of started) {
    for (const line of survivors(pid)) {
      try {
        process.kill(Number(line.split(/\s+/)[1]), "SIGKILL");
      } catch {}
    }
  }
  started.clear();
});

function start(
  p: ReturnType<typeof project>,
  extra: Record<string, string> = {},
  args: string[] = [],
): { child: ReturnType<typeof spawn>; done: Promise<Run> } {
  const env = cleanEnv();
  const child = spawn(
    process.execPath,
    [
      vitestEntry,
      "run",
      "--root",
      p.root,
      "--config",
      path.join(p.root, "vitest.config.mjs"),
      // Imported as it is, not bundled: the config then sets the test seam on the same
      // registry-process.mjs instance the plugin loads (DELAY).
      "--configLoader",
      "native",
      ...args,
    ],
    {
      cwd: p.root,
      // Its own process group, so every process it starts can be found afterwards.
      detached: posix,
      env: {
        ...env,
        FORCE_COLOR: "0",
        PROBE_OUT: p.out,
        // Until the registry exists its name is unknown; its directory is enough.
        PROBE_META: registryDir(p.root),
        ...extra,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  started.add(child.pid!);
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));
  const done = new Promise<Run>((resolve) =>
    child.on("close", (code, signal) => resolve({ code, signal, pid: child.pid!, output })),
  );
  return { child, done };
}

/** Processes left in the run's process group (POSIX), other than none expected. */
function survivors(pid: number): string[] {
  const listing = execFileSync("ps", ["-A", "-o", "pgid=,pid=,command="], { encoding: "utf8" });
  return listing
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.split(/\s+/)[0] === String(pid));
}

async function settled(pid: number): Promise<string[]> {
  // A killed child is reaped asynchronously; give the OS a moment.
  for (let i = 0; i < 20; i++) {
    const left = survivors(pid);
    if (left.length === 0) return left;
    await new Promise((r) => setTimeout(r, 50));
  }
  return survivors(pid);
}

const records = (out: string) =>
  fs
    .readFileSync(out, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { installed: boolean; before: boolean });

describe("native engine: the registry builds in the background on a cold cache", () => {
  it("starts without it, picks it up for later files, and leaves it for the next run", async () => {
    const p = project(["a.test.mjs", "b.test.mjs"]);
    const run = await start(p, { PROBE_WAIT: "1" }).done;
    expect(run.code, run.output).toBe(0);
    // The first file started before the registry existed and loaded React Native file by
    // file; the second started after it landed and used it.
    expect(records(p.out)).toEqual([
      { installed: false, before: true },
      { installed: true, before: false },
    ]);
    if (posix) expect(await settled(run.pid)).toEqual([]);

    const next = await start(p).done;
    expect(next.code, next.output).toBe(0);
    expect(records(p.out).at(-1)).toEqual({ installed: true, before: false });
  }, 180_000);

  it("finishes the build at close so the next run is warm", async () => {
    const p = project();
    const run = await start(p, { PROBE_META: registryDir(p.root) }).done;
    expect(run.code, run.output).toBe(0);
    expect(records(p.out)).toEqual([{ installed: false, before: true }]);
    expect(published(p.root)).toBe(true);
    if (posix) expect(await settled(run.pid)).toEqual([]);
  }, 120_000);

  it("waits for the build under CI, so every file uses it", async () => {
    const p = project();
    const run = await start(p, { GITHUB_ACTIONS: "true" }).done;
    expect(run.code, run.output).toBe(0);
    expect(records(p.out)).toEqual([{ installed: true, before: false }]);
    if (posix) expect(await settled(run.pid)).toEqual([]);
  }, 120_000);

  it("waits for the build with registryBuild: 'wait'", async () => {
    const p = project();
    const config = path.join(p.root, "vitest.config.mjs");
    fs.writeFileSync(
      config,
      fs
        .readFileSync(config, "utf8")
        .replace(
          'reactNative({ engine: "native" })',
          'reactNative({ engine: "native", registryBuild: "wait" })',
        ),
    );
    const run = await start(p).done;
    expect(run.code, run.output).toBe(0);
    expect(records(p.out)).toEqual([{ installed: true, before: false }]);
  }, 120_000);

  it("keeps building after a cancelled run, and close then stops it", async () => {
    // --bail cancels the run after the first failure; the build goes on (in watch mode
    // the session continues and later reruns use it), but close does not wait for it.
    const p = project(["a.test.mjs", "fail.test.mjs"]);
    fs.writeFileSync(
      path.join(p.root, "fail.test.mjs"),
      `test("fails", () => { throw new Error("x"); });\n`,
    );
    const begun = Date.now();
    const run = await start(p, { [DELAY]: "60000" }, ["--bail=1"]).done;
    expect(run.output).toMatch(/fails/);
    // Without the cancel, close would wait 15 s (half the fixture's teardownTimeout).
    expect(Date.now() - begun).toBeLessThan(12_000);
    if (posix) expect(await settled(run.pid)).toEqual([]);
    expect(published(p.root)).toBe(false);
  }, 120_000);

  it.skipIf(!posix)(
    "keeps building when a watch session cancels a run",
    async () => {
      // A watch-mode key (c, h, a filter) cancels the run but not the session: the build
      // goes on, and later reruns use the registry.
      const p = project();
      const hold = path.join(p.root, "started");
      const script = path.join(p.root, "watch.mjs");
      const node = pathToFileURL(path.join(path.dirname(vitestEntry), "dist", "node.js")).href;
      const result = path.join(p.root, "watch.json");
      fs.writeFileSync(
        script,
        `import fs from "node:fs";
import { createVitest } from ${JSON.stringify(node)};
const vitest = await createVitest("test", {
  root: ${JSON.stringify(p.root)},
  config: ${JSON.stringify(path.join(p.root, "vitest.config.mjs"))},
  configLoader: "native",
  watch: true,
});
const run = vitest.start();
while (!fs.existsSync(${JSON.stringify(hold)})) await new Promise((r) => setTimeout(r, 50));
await vitest.cancelCurrentRun("keyboard-input");
await run.catch(() => {});
const dir = ${JSON.stringify(registryDir(p.root))};
let published = false;
for (let i = 0; i < 600 && !published; i++) {
  published = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(".cjs.json"));
  if (!published) await new Promise((r) => setTimeout(r, 50));
}
fs.writeFileSync(${JSON.stringify(result)}, JSON.stringify({ published }));
await vitest.close();
process.exit(0);
`,
      );
      const child = spawn(process.execPath, [script], {
        cwd: p.root,
        detached: true,
        env: {
          ...cleanEnv(),
          FORCE_COLOR: "0",
          PROBE_OUT: p.out,
          PROBE_META: registryDir(p.root),
          PROBE_HOLD: hold,
          PROBE_HOLD_MS: "2000",
          [DELAY]: "4000",
        },
        stdio: "ignore",
      });
      started.add(child.pid!);
      await new Promise((r) => child.on("close", r));
      // The build, held for 4 s, finished after the cancel while the session was open.
      expect(JSON.parse(fs.readFileSync(result, "utf8"))).toEqual({ published: true });
      expect(await settled(child.pid!)).toEqual([]);
    },
    120_000,
  );

  it.skipIf(!posix)(
    "stops the compiler when the run is signalled while close waits",
    async () => {
      // Vitest removes its own signal handlers when it starts to close.
      const p = project();
      const { child, done } = start(p, { [DELAY]: "60000" });
      let output = "";
      child.stdout?.on("data", (chunk) => (output += chunk));
      for (let i = 0; i < 1200 && !/Duration/.test(output); i++)
        await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 300));
      expect(survivors(child.pid!).some((line) => line.includes("registry-compiler"))).toBe(true);
      process.kill(child.pid!, "SIGTERM");
      const run = await done;
      expect(run.signal).toBe("SIGTERM");
      // At once: the compiler's own orphan check polls every 5 s.
      expect(await settled(child.pid!)).toEqual([]);
    },
    120_000,
  );

  it.skipIf(!posix)(
    "ends a compiler whose run was killed outright",
    async () => {
      const p = project();
      const hold = path.join(p.root, "started");
      const { child, done } = start(p, { PROBE_HOLD: hold, [DELAY]: "60000" });
      for (let i = 0; i < 1200 && !fs.existsSync(hold); i++)
        await new Promise((r) => setTimeout(r, 50));
      expect(survivors(child.pid!).some((line) => line.includes("registry-compiler"))).toBe(true);
      // SIGKILL leaves Vitest no handler and no exit event: only the compiler can notice.
      process.kill(child.pid!, "SIGKILL");
      await done;
      let left = survivors(child.pid!);
      for (let i = 0; i < 200 && left.length > 0; i++) {
        await new Promise((r) => setTimeout(r, 50));
        left = survivors(child.pid!);
      }
      expect(left).toEqual([]);
    },
    120_000,
  );

  it("keeps a worker's first decision for every later file it runs", async () => {
    // isolate:false: one worker, one realm, for every file. The first file starts before
    // the registry lands and loads React Native file by file; later files in the same
    // realm must not switch to the registry's second copy of it.
    const p = project(["a.test.mjs", "b.test.mjs", "c.test.mjs"], { isolate: false });
    const run = await start(p, { PROBE_WAIT: "1" }).done;
    expect(run.code, run.output).toBe(0);
    expect(records(p.out)).toEqual([
      { installed: false, before: true },
      { installed: false, before: false },
      { installed: false, before: false },
    ]);
  }, 120_000);

  // Without a terminal, Vitest turns either signal into process.exit, which only the
  // exit hook covers. The signal reaches only Vitest, not its process group, as when a
  // parent process stops it, so the compiler must be stopped, not left to finish.
  it.skipIf(!posix).each(["SIGINT", "SIGTERM"] as const)(
    "leaves no compiler behind when the run is stopped with %s",
    async (signal) => {
      const p = project();
      const hold = path.join(p.root, "started");
      const { child, done } = start(p, { PROBE_HOLD: hold, [DELAY]: "60000" });
      for (let i = 0; i < 1200 && !fs.existsSync(hold); i++)
        await new Promise((r) => setTimeout(r, 50));
      expect(fs.existsSync(hold)).toBe(true);
      // The compiler is running beside the held test file.
      expect(survivors(child.pid!).some((line) => line.includes("registry-compiler"))).toBe(true);
      process.kill(child.pid!, signal);
      await done;
      // A compiler left running would still be in the group: it is held for a minute.
      expect(await settled(child.pid!)).toEqual([]);
    },
    120_000,
  );

  it.skipIf(!posix)(
    "leaves no compiler behind when Vitest exits without closing",
    async () => {
      // A global teardown that never finishes: close never reaches the build, and once
      // nothing else is left the process exits; only the exit hook can stop the compiler,
      // which must not have kept the process alive either.
      const p = project(["a.test.mjs"], { globalSetup: ["./hang.mjs"] });
      fs.writeFileSync(
        path.join(p.root, "hang.mjs"),
        `export default () => () => new Promise(() => {});\n`,
      );
      const begun = Date.now();
      const run = await start(p, { [DELAY]: "60000" }).done;
      expect(Date.now() - begun).toBeLessThan(20_000);
      expect(await settled(run.pid)).toEqual([]);
    },
    120_000,
  );

  it("keeps the cache valid when two cold runs build it at once", async () => {
    const p = project();
    const runs = await Promise.all([start(p).done, start(p).done]);
    for (const run of runs) expect(run.code, run.output).toBe(0);
    expect(published(p.root)).toBe(true);
    expect(fs.readdirSync(registryDir(p.root)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    if (posix) for (const run of runs) expect(await settled(run.pid)).toEqual([]);
    const next = await start(p).done;
    expect(next.code, next.output).toBe(0);
    expect(records(p.out).at(-1)?.installed).toBe(true);
  }, 180_000);
});
