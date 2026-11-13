/**
 * `vitest-native compare` (docs/compare-mode.md).
 *
 * The recorded reports in fixtures/compare-reports/ are real Jest 30.2.0 `--json` and
 * Vitest 5.0.5 JSON-reporter output for fixtures/compare-project/, whose test files
 * behave differently under the two runners on purpose (`*.check.js`, so this suite does
 * not collect them). Paths in them are placeholders (/project for the root).
 *
 * The end-to-end tests run the CLI's main(): Vitest for real on a copy of the fixture,
 * with the recorded Jest report (`--jest-results`). This repository does not depend on
 * Jest; with VN_COMPARE_JEST set to an installed Jest package directory, the last block
 * runs both runners for real and checks that their live reports put every test in the
 * bucket the recorded ones do. VN_COMPARE_RECORD=1 re-records both reports from that run
 * (then run oxfmt on fixtures/compare-reports/). Each spawns Vitest, so they run under
 * vitest.e2e.config.ts (`test:e2e`), not in the unit suite.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classify,
  normaliseReport,
  type Bucket,
  type Comparison,
  type NormaliseContext,
} from "../src/cli/compare.js";
import { parseCompareArgs, runCompare } from "../src/cli/compare-run.js";
import { packageDir, runCli, scratchProject, treeBytes } from "./support/compare-helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.join(here, "fixtures", "compare-project");
const REPORTS = path.join(here, "fixtures", "compare-reports");
const PLACEHOLDER = "/project";

const recorded = (name: "jest" | "vitest") =>
  JSON.parse(fs.readFileSync(path.join(REPORTS, `${name}.json`), "utf8")) as {
    testResults: Array<{ name: string; message: string; assertionResults: unknown[] }>;
  };

/** Every test of the fixture, and the bucket its two results put it in. */
const EXPECTED: Array<[Bucket, string, string[], string]> = [
  ["improvement", "src/collect-fails-under-jest.check.js", [], "loads under Vitest"],
  ["regression", "src/collect-fails-under-vitest.check.js", [], "first"],
  ["regression", "src/collect-fails-under-vitest.check.js", [], "second"],
  ["same-pass", "src/each.check.js", [], "formats an object { a: 1, b: [Array] }"],
  ["same-pass", "src/each.check.js", [], 'pretty-formats {"a": 1}'],
  ["same-pass", "src/each.check.js", [], 'interpolates {"deep": true}'],
  ["same-pass", "src/each.check.js", [], "keeps % a"],
  ["regression", "src/hook-fails-under-vitest.check.js", ["with setup"], "needs the setup"],
  ["only-jest", "src/jest-only.check.js", [], "runs under Jest only"],
  ["regression", "src/runner-differences.check.js", ["globals"], "uses the jest global"],
  ["improvement", "src/runner-differences.check.js", ["globals"], "uses the vi global"],
  ["skip-difference", "src/runner-differences.check.js", [], "is skipped under Vitest only"],
  ["only-jest", "src/runner-differences.check.js", ["jest block"], "exists under Jest only"],
  ["only-vitest", "src/runner-differences.check.js", ["vitest block"], "exists under Vitest only"],
  ["same-pass", "src/same.check.js", ["math"], "adds"],
  ["same-pass", "src/same.check.js", ["math", "nested"], "multiplies"],
  ["same-pass", "src/same.check.js", ["math"], "repeats a title"],
  ["same-fail", "src/same.check.js", [], "fails under both runners"],
  ["same-skip", "src/same.check.js", [], "is skipped under both runners"],
  ["regression", "src/snapshot-unrecorded.check.js", ["badge"], "renders"],
  ["same-pass", "src/snapshot.check.js", ["card"], "renders"],
  ["only-vitest", "src/vitest-only.check.js", [], "runs under Vitest only"],
];

/** The Vitest titles of the it.each tests, as Vitest 5.0.5 formats them. */
const VITEST_EACH_TITLES = [
  "formats an object { a: 1, b: [ 1, 2 ] }",
  "pretty-formats %p",
  "interpolates { deep: true }",
  "keeps % a undefined",
];

const sorted = (rows: Array<[Bucket, string, string[], string]>) =>
  [...rows].map((r) => JSON.stringify(r)).sort();

function bucketsOf(c: Comparison) {
  return sorted(c.entries.map((e) => [e.bucket, e.file, e.ancestors, e.title]));
}

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

/** A copy of the fixture project with Vitest (and Jest, when given) linked in. */
function project(jestDir?: string): string {
  return scratchProject({ from: PROJECT, jestDir });
}

/** The recorded Jest report, its placeholder paths pointed at `root`. */
function jestReportFor(root: string): string {
  const json = recorded("jest");
  for (const f of json.testResults) {
    f.name = path.join(root, path.relative(PLACEHOLDER, f.name));
    f.message = f.message.split(PLACEHOLDER).join(root);
  }
  const file = path.join(root, "..", `${path.basename(root)}-jest.json`);
  fs.writeFileSync(file, JSON.stringify(json));
  return file;
}

describe("compare: end to end with Vitest and a recorded Jest report", () => {
  it("runs Vitest, classifies, writes the report, and leaves the project as it was", async () => {
    const root = project();
    const before = treeBytes(root);
    const out = path.join(root, "..", `${path.basename(root)}-report.json`);
    const { code, text } = await runCli([
      "--root",
      root,
      "--jest-results",
      jestReportFor(root),
      "--json",
      out,
    ]);

    expect(code).toBe(1);
    // --jest-results: the run order is unknown, so the %p row is listed for review here.
    expect(text).toContain("✗ 12 of the 16 tests that pass under Jest do not pass under Vitest");
    expect(text).toContain("✗ 4 tests could only be matched by title shape; check them");
    expect(text).toContain("✗ `vitest run` exits 1:");
    expect(text).toContain("snapshots read from an isolated copy");
    expect(text).toMatch(/2× cannot load this file under Vitest/);
    expect(text).toContain(
      "no Vitest snapshot recorded. Give Vitest its own snapshot directory first",
    );
    expect(text).toContain("src/jest-only.check.js (1 test, passed)");
    expect(text).toContain(
      "formats an object { a: 1, b: [Array] }  ~  formats an object { a: 1, b: [ 1, 2 ] }",
    );

    const report = JSON.parse(fs.readFileSync(out, "utf8"));
    expect(report.format).toBe("vitest-native-compare@1");
    expect(report.verdict).toMatchObject({
      holds: false,
      jestPassed: 16,
      confirmed: 4,
      vitestExitCode: 1,
    });
    expect(report.projectChanges).toEqual([]);
    // The live Vitest run lands every test where the recorded one did.
    const listed = report.tests
      .filter((t: { bucket: Bucket }) => t.bucket !== "same-pass")
      .map((t: { bucket: Bucket; file: string; ancestors: string[]; title: string }) => [
        t.bucket,
        t.file,
        t.ancestors,
        t.title,
      ]);
    expect(sorted(listed)).toEqual(
      sorted(EXPECTED.filter(([b]) => b !== "same-pass" && b !== "same-skip")),
    );
    expect(JSON.stringify(report)).not.toContain(root);
    expect(JSON.stringify(report)).not.toContain(os.homedir());

    // Every file, Jest's .snap files included, is byte-identical (Vitest rewrites a Jest
    // .snap header when it reads one, even under CI); Vitest read its own.
    expect(treeBytes(root)).toEqual(before);
    expect(fs.existsSync(path.join(root, "node_modules", ".vitest-native"))).toBe(false);
  }, 120_000);

  it("fails the claim when Vitest's config collects nothing", async () => {
    const root = project();
    fs.writeFileSync(
      path.join(root, "nothing.config.mjs"),
      `export default { test: { include: ["nothing/**/*.check.js"], passWithNoTests: true } };\n`,
    );
    const { code, text } = await runCli([
      "--root",
      root,
      "--jest-results",
      jestReportFor(root),
      "--vitest-config",
      path.join(root, "nothing.config.mjs"),
    ]);
    expect(code).toBe(1);
    expect(text).toContain("16 not collected");
    expect(text).toContain("! Test files only Jest collected (9):");
    // An absolute config path is shown relative to the root.
    expect(text).toContain("config: nothing.config.mjs");
  }, 120_000);

  it("stops a runner that outlives --timeout and reports it", async () => {
    const root = project();
    fs.writeFileSync(
      path.join(root, "src", "hang.check.js"),
      `it("hangs", () => new Promise(() => {}), 600_000);\n`,
    );
    const { code, text } = await runCli([
      "--root",
      root,
      "--jest-results",
      jestReportFor(root),
      "--timeout",
      "8",
    ]);
    expect(code).toBe(2);
    expect(text).toContain("Vitest did not finish within 8s and was stopped");
  }, 120_000);
});

const jestDir = process.env.VN_COMPARE_JEST;

describe.skipIf(!jestDir)("compare: end to end with real Jest (VN_COMPARE_JEST)", () => {
  it("runs both runners and agrees with the recorded reports", async () => {
    const root = project(jestDir);
    const before = treeBytes(root);
    const raw = path.join(root, "..", `${path.basename(root)}-raw`);
    const lines: string[] = [];
    const parsed = parseCompareArgs(["--root", root]);
    if ("error" in parsed) throw new Error(parsed.error);
    const code = await runCompare({ ...parsed, log: (l) => lines.push(l), rawReportsDir: raw });
    expect(code, lines.join("\n")).toBe(1);
    expect(treeBytes(root)).toEqual(before);

    const live = {
      jest: JSON.parse(fs.readFileSync(path.join(raw, "jest.json"), "utf8")),
      vitest: JSON.parse(fs.readFileSync(path.join(raw, "vitest.json"), "utf8")),
    };
    const ctx: NormaliseContext = { root };
    const c = classify(
      normaliseReport(live.jest, "jest", ctx),
      normaliseReport(live.vitest, "vitest", ctx),
    );
    expect(bucketsOf(c)).toEqual(sorted(EXPECTED));
    expect(
      c.entries.filter((e) => e.file === "src/each.check.js").map((e) => e.vitestTitle),
    ).toEqual(VITEST_EACH_TITLES);

    if (process.env.VN_COMPARE_RECORD === "1") {
      // Placeholders for every machine-specific path, longest first.
      const replacements: Array<[string, string]> = [
        [root, PLACEHOLDER],
        [fs.realpathSync(jestDir as string), "/jest"],
        [packageDir("vitest"), "/vitest"],
        [path.resolve(here, "..", "..", ".."), "/repo"],
        [path.dirname(fs.realpathSync(jestDir as string)), "/jest-deps"],
        [os.homedir(), "/home/user"],
      ];
      for (const name of ["jest", "vitest"] as const) {
        let text = JSON.stringify(live[name], null, 2);
        for (const [from, to] of replacements) text = text.split(from).join(to);
        fs.writeFileSync(path.join(REPORTS, `${name}.json`), `${text}\n`);
      }
    }
  }, 180_000);
});
