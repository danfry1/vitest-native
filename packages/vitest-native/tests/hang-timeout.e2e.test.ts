/**
 * `hangTimeout` end to end: a project using this build's plugin, with a test stuck in a
 * synchronous loop. Before it, Vitest waited forever and printed nothing; now the run
 * fails within the limit and names the file and test. Uses the mock engine, which needs
 * no React Native install: the watch is the same under both engines.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { scratchProject } from "./support/compare-helpers.js";

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = pathToFileURL(path.join(PACKAGE, "dist", "index.mjs")).href;

function project(option: string, files: Record<string, string>) {
  return scratchProject({
    files: {
      "vitest.config.mjs":
        `import { reactNative } from ${JSON.stringify(DIST)};\n` +
        `export default { plugins: [reactNative({ engine: "mock", ${option} })], test: { include: ["*.check.js"], globals: true } };\n`,
      ...files,
    },
  });
}

function vitest(root: string) {
  const cli = path.join(fs.realpathSync(path.join(root, "node_modules", "vitest")), "vitest.mjs");
  // The child is its own Vitest run, not a worker of this one.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("VITEST")),
  );
  return new Promise<{ code: number | null; output: string; ms: number }>((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [cli, "run"], {
      cwd: root,
      env: { ...env, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    // A safety net for this test only: never leave a spinning child behind.
    const kill = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("close", (code) => {
      clearTimeout(kill);
      resolve({ code, output, ms: Date.now() - started });
    });
  });
}

it("fails a test stuck in a synchronous loop within hangTimeout, naming it", async () => {
  const root = project("hangTimeout: 3000", {
    "ok.check.js": `test("fine", () => {});\n`,
    "spin.check.js": `test("spins forever", () => { for (;;) {} });\n`,
  });
  const { code, output, ms } = await vitest(root);
  expect(code, output).toBe(1);
  expect(output).toContain("No test made progress for 3 s (hangTimeout)");
  expect(output).toMatch(/Running: \S*spin\.check\.js › spins forever/);
  expect(ms).toBeLessThan(45_000);
}, 90_000);

it("leaves a healthy run alone", async () => {
  const root = project("hangTimeout: 3000", {
    "slow.check.js": `test("waits 1 s", () => new Promise((r) => setTimeout(r, 1000)));\n`,
  });
  const { code, output } = await vitest(root);
  expect(code, output).toBe(0);
  expect(output).not.toContain("hangTimeout");
}, 90_000);

it("is off with hangTimeout: false", async () => {
  // The same test makes no progress for 4 s: a 1 s limit stops it, false lets it finish.
  const files = {
    "quiet.check.js": `test("quiet 4 s", () => new Promise((r) => setTimeout(r, 4000)));\n`,
  };
  const limited = await vitest(project("hangTimeout: 1000", files));
  expect(limited.code, limited.output).toBe(1);
  expect(limited.output).toContain("No test made progress for 1 s");
  const off = await vitest(project("hangTimeout: false", files));
  expect(off.code, off.output).toBe(0);
  expect(off.output).not.toContain("No test made progress");
}, 90_000);
