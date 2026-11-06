/**
 * The hang guard end to end: real Vitest runs that hang, under the CI wrappers
 * (scripts/ci/). Each must fail quickly and name what was running, where before it
 * held the CI job until its own timeout and printed nothing about where.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scratchProject } from "./support/compare-helpers.js";

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "ci");

function run(args: string[], env: Record<string, string>, cwd: string) {
  return new Promise<{ code: number | null; output: string; ms: number }>((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, ...env, NO_COLOR: "1", FORCE_COLOR: "0", GITHUB_ACTIONS: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output, ms: Date.now() - started }));
  });
}

const CONFIG = `export default { test: { include: ["*.check.js"], globals: true } };\n`;

describe("hang guard", () => {
  it("fails a test stuck in a synchronous loop, naming the file and the test", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": CONFIG,
        "ok.check.js": `test("fine", () => {});\n`,
        "spin.check.js": `test("spins forever", () => { for (;;) {} });\n`,
      },
    });
    const { code, output, ms } = await run(
      [path.join(scripts, "vitest.mjs"), "run"],
      { VN_HANG_GUARD: "1", VN_HANG_IDLE_MS: "4000" },
      root,
    );
    expect(code).toBe(1);
    expect(output).toMatch(/No test progress for 0\.1 min/);
    expect(output).toContain(`spin.check.js (test "spins forever")`);
    expect(ms).toBeLessThan(60_000);
  }, 90_000);

  it("fails a hook stuck in a loop after its tests passed", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": CONFIG,
        "hook.check.js": `test("passes", () => {});\nafterAll(() => { for (;;) {} });\n`,
      },
    });
    const { code, output } = await run(
      [path.join(scripts, "vitest.mjs"), "run"],
      { VN_HANG_GUARD: "1", VN_HANG_IDLE_MS: "4000" },
      root,
    );
    expect(code).toBe(1);
    expect(output).toMatch(/hook\.check\.js \(between tests/);
  }, 90_000);

  it("stops a run whose main process is stuck, at the step's deadline", async () => {
    // A global setup runs in Vitest's main process: the reporter cannot fire there,
    // so the deadline outside it has to.
    const root = scratchProject({
      files: {
        "vitest.config.mjs": `export default { test: { include: ["*.check.js"], globals: true, globalSetup: ["./gs.mjs"] } };\n`,
        "gs.mjs": `export default () => { for (;;) {} };\n`,
        "a.check.js": `test("never runs", () => {});\n`,
      },
    });
    const { code, output, ms } = await run(
      [
        path.join(scripts, "with-deadline.mjs"),
        "8",
        "--",
        process.execPath,
        path.join(scripts, "vitest.mjs"),
        "run",
      ],
      {},
      root,
    );
    expect(code).toBe(1);
    expect(output).toMatch(/passed its 8 s deadline and was stopped/);
    expect(output).toMatch(/No test file was running/);
    expect(ms).toBeLessThan(40_000);
  }, 90_000);

  it("leaves a run that finishes alone", async () => {
    const root = scratchProject({
      files: { "vitest.config.mjs": CONFIG, "ok.check.js": `test("fine", () => {});\n` },
    });
    const { code, output } = await run(
      [
        path.join(scripts, "with-deadline.mjs"),
        "60",
        "--",
        process.execPath,
        path.join(scripts, "vitest.mjs"),
        "run",
      ],
      {},
      root,
    );
    expect(code).toBe(0);
    expect(output).not.toMatch(/deadline|No test progress/);
  }, 90_000);
});
