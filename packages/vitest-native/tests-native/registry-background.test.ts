import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

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
    await new Promise(() => {});
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

/** Holds the compiler before it starts (registry-compiler.mjs). */
const DELAY = "VITEST_NATIVE_REGISTRY_TEST_DELAY_MS";

let count = 0;
function project(files = ["a.test.mjs"]) {
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
      `export default { plugins: [reactNative({ engine: "native" })], test: { globals: true, ` +
      `include: ["*.test.mjs"], maxWorkers: 1, fileParallelism: false, teardownTimeout: 30_000 } };\n`,
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

function start(
  p: ReturnType<typeof project>,
  extra: Record<string, string> = {},
): { child: ReturnType<typeof spawn>; done: Promise<Run> } {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITEST") || key === "NODE_OPTIONS" || key === "CI") delete env[key];
  }
  const child = spawn(
    process.execPath,
    [vitestEntry, "run", "--root", p.root, "--config", path.join(p.root, "vitest.config.mjs")],
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

  it("stops the build at close under CI", async () => {
    const p = project();
    // The compiler is held for longer than the run, so only a stop explains its absence,
    // and outside CI close would wait up to 29 s of the fixture's teardownTimeout for it.
    const started = Date.now();
    const run = await start(p, { CI: "true", [DELAY]: "60000" }).done;
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(run.code, run.output).toBe(0);
    expect(records(p.out)).toEqual([{ installed: false, before: true }]);
    if (posix) expect(await settled(run.pid)).toEqual([]);
    expect(published(p.root)).toBe(false);
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
