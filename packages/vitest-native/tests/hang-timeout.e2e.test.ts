/**
 * `hangTimeout` end to end: a project using this build's plugin, with a test stuck in a
 * synchronous loop. Before it, Vitest waited forever and printed nothing; now the run
 * fails within the limit and names the file and test. Uses the mock engine, which needs
 * no React Native install: the watch is the same under both engines.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { scratchProject } from "./support/compare-helpers.js";

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = pathToFileURL(path.join(PACKAGE, "dist", "index.mjs")).href;

const requireHere = createRequire(path.join(PACKAGE, "package.json"));
// The plugin requires React (a peer dependency); the scratch project gets this repo's.
const REACT = path.dirname(requireHere.resolve("react/package.json"));

/** The stuck worker wrote its pid before spinning; after the run it must be gone. */
async function expectWorkerGone(root: string) {
  const pid = Number(fs.readFileSync(path.join(root, "worker.pid"), "utf8"));
  expect(pid).toBeGreaterThan(0);
  const alive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  for (let i = 0; i < 30 && alive(); i++) await new Promise((r) => setTimeout(r, 100));
  const survived = alive();
  if (survived) process.kill(pid, "SIGKILL"); // never leave it spinning, even on failure
  expect(survived).toBe(false);
}

function project(option: string, files: Record<string, string>) {
  const root = scratchProject({
    files: {
      "vitest.config.mjs":
        `import { reactNative } from ${JSON.stringify(DIST)};\n` +
        // hookTimeout 1 s keeps a stuck test's own budget (timeout + 2 hook timeouts + 1 s)
        // short, so a real hang is caught in seconds here.
        `export default { plugins: [reactNative({ engine: "mock", ${option} })], test: { include: ["*.check.js"], globals: true, hookTimeout: 1000 } };\n`,
      ...files,
    },
  });
  fs.symlinkSync(REACT, path.join(root, "node_modules", "react"), "junction");
  return root;
}

function vitest(root: string, harnessMs = 60_000) {
  const cli = path.join(fs.realpathSync(path.join(root, "node_modules", "vitest")), "vitest.mjs");
  // The child is its own Vitest run, not a worker of this one.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("VITEST")),
  );
  return new Promise<{ code: number | null; output: string; ms: number; stopped: boolean }>(
    (resolve) => {
      const started = Date.now();
      const child = spawn(process.execPath, [cli, "run"], {
        cwd: root,
        env: { ...env, NO_COLOR: "1", FORCE_COLOR: "0", GITHUB_ACTIONS: "" },
        stdio: ["ignore", "pipe", "pipe"],
        // Its own process group, so the harness can stop all of it.
        detached: process.platform !== "win32",
      });
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      let stopped = false;
      const kill = setTimeout(() => {
        stopped = true;
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid!, "SIGKILL");
      }, harnessMs);
      child.on("close", (code) => {
        clearTimeout(kill);
        resolve({ code, output, ms: Date.now() - started, stopped });
      });
    },
  );
}

const SPIN = `import fs from "node:fs";\ntest("spins forever", () => { fs.writeFileSync("worker.pid", String(process.pid)); for (;;) {} });\n`;

it("fails a test stuck in a synchronous loop, naming the test", async () => {
  const root = project("hangTimeout: 3000", {
    "ok.check.js": `test("fine", () => {});\n`,
    "spin.check.js": SPIN,
  });
  const { code, output, ms } = await vitest(root);
  expect(code, output).toBe(1);
  expect(output).toContain("No test made progress for 3 s (hangTimeout)");
  // The test's name comes from the worker's synchronous record, not the batched events.
  expect(output).toMatch(/Running: \S*spin\.check\.js › spins forever/);
  expect(ms).toBeLessThan(45_000);
  await expectWorkerGone(root);
}, 90_000);

it("lets a test run its own longer timeout", async () => {
  // No progress for 4 s, past a 1.5 s limit, inside the test's own 6 s.
  const root = project("hangTimeout: 1500", {
    "slow.check.js": `test("waits 4 s", () => new Promise((r) => setTimeout(r, 4000)), 6000);\n`,
  });
  const { code, output } = await vitest(root);
  expect(code, output).toBe(0);
  expect(output).not.toContain("No test made progress");
}, 90_000);

it("leaves retried timeouts as ordinary test failures", async () => {
  // Each attempt times out at 0.8 s; four attempts take longer than the 1 s limit.
  const root = project("hangTimeout: 1000", {
    "retry.check.js": `test("never settles", () => new Promise(() => {}), { timeout: 800, retry: 3 });\n`,
  });
  const { code, output } = await vitest(root);
  expect(code, output).toBe(1);
  expect(output).toMatch(/Test timed out in 800ms/);
  expect(output).not.toContain("No test made progress");
}, 90_000);

it("leaves a healthy run alone", async () => {
  const root = project("hangTimeout: 3000", {
    "slow.check.js": `test("waits 1 s", () => new Promise((r) => setTimeout(r, 1000)));\n`,
  });
  const { code, output } = await vitest(root);
  expect(code, output).toBe(0);
  expect(output).not.toContain("hangTimeout");
}, 90_000);

it("is off with false, and by default where the hot runtime is not on", async () => {
  for (const option of ["hangTimeout: false", ""]) {
    const root = project(option, { "spin.check.js": SPIN });
    // Left alone, the stuck run is still going when the harness stops it.
    const { output, stopped } = await vitest(root, 10_000);
    expect([option, stopped]).toEqual([option, true]);
    expect(output).not.toContain("No test made progress");
  }
}, 90_000);
