/**
 * The timeout-margin reporter (scripts/ci/timeout-margin-reporter.mjs): a passing test
 * that used more than 60% of its timeout is named, so a test drifting toward its limit
 * shows before a slow runner times it out. Unit cases feed it test results; the last case
 * runs real Vitest under the CI wrapper, which proves the fields it reads exist.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import TimeoutMarginReporter from "../scripts/ci/timeout-margin-reporter.mjs";
import { scratchProject } from "./support/compare-helpers.js";

const testCase = (
  name: string,
  duration: number,
  timeout: number | undefined,
  state = "passed",
) => ({
  module: { moduleId: "/p/a.test.ts" },
  fullName: name,
  options: { timeout },
  result: () => ({ state }),
  diagnostic: () => ({ duration }),
});

function report(cases: ReturnType<typeof testCase>[], github = false) {
  const write = vi.fn();
  const reporter = new TimeoutMarginReporter({ write, github });
  for (const entry of cases) reporter.onTestCaseResult(entry);
  reporter.onTestRunEnd();
  return write.mock.calls.map(([text]) => String(text)).join("");
}

describe("timeout-margin reporter", () => {
  it("names a passing test over 60% of its timeout, and not one at or under it", () => {
    const output = report([testCase("slow", 3001, 5000), testCase("edge", 3000, 5000)]);
    expect(output).toContain("/p/a.test.ts > slow: 3001 ms of 5000 ms (60%)");
    expect(output).not.toContain("edge");
  });

  it("says nothing when every test is inside the margin", () => {
    expect(report([testCase("quick", 100, 5000)])).toBe("");
  });

  it("skips failed tests (the timeout already failed them) and tests with no limit", () => {
    const output = report([
      testCase("timed out", 5001, 5000, "failed"),
      testCase("no limit", 9000, 0),
      testCase("infinite", 9000, Number.POSITIVE_INFINITY),
      testCase("unknown", 9000, undefined),
    ]);
    expect(output).toBe("");
  });

  it("writes a GitHub warning annotation per test on Actions", () => {
    const output = report([testCase("slow", 4000, 5000)], true);
    expect(output).toContain("::warning file=/p/a.test.ts,title=Test near its timeout::");
  });

  it("reports from a real Vitest run under the CI wrapper", async () => {
    const root = scratchProject({
      files: {
        "vitest.config.mjs": `export default { test: { include: ["*.check.js"], globals: true } };\n`,
        "slow.check.js": `test("waits 400 ms of 500", async () => { await new Promise((r) => setTimeout(r, 400)); }, 500);\ntest("quick", () => {});\n`,
      },
    });
    const wrapper = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../scripts/ci/vitest.mjs",
    );
    const output = await new Promise<string>((resolve) => {
      const child = spawn(process.execPath, [wrapper, "run"], {
        cwd: root,
        env: {
          ...process.env,
          VN_HANG_GUARD: "1",
          VN_PROGRESS_LOG: "",
          GITHUB_ACTIONS: "",
          NO_COLOR: "1",
          FORCE_COLOR: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let text = "";
      child.stdout.on("data", (chunk) => (text += chunk));
      child.stderr.on("data", (chunk) => (text += chunk));
      child.on("close", () => resolve(text));
    });
    expect(output).toMatch(/slow\.check\.js > waits 400 ms of 500: \d+ ms of 500 ms/);
    expect(output).not.toMatch(/> quick:/);
  }, 60_000);
});
