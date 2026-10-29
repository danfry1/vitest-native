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
 * (then run oxfmt on fixtures/compare-reports/). The cases an adversarial review found
 * are in cli-compare-edges.test.ts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli/index.js";
import {
  classify,
  clusters,
  firstLine,
  normaliseReport,
  relativeFile,
  renderComparison,
  sanitizeMessage,
  type Bucket,
  type Comparison,
  type NormaliseContext,
} from "../src/cli/compare.js";
import { parseCompareArgs, runCompare, splitArgs } from "../src/cli/compare-run.js";
import { packageDir, runCli, scratchProject, treeBytes } from "./support/compare-helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.join(here, "fixtures", "compare-project");
const REPORTS = path.join(here, "fixtures", "compare-reports");
const PLACEHOLDER = "/project";

const recorded = (name: "jest" | "vitest") =>
  JSON.parse(fs.readFileSync(path.join(REPORTS, `${name}.json`), "utf8")) as {
    testResults: Array<{ name: string; message: string; assertionResults: unknown[] }>;
  };

/** Placeholder paths need no symlink resolution. */
const posixCtx: NormaliseContext = {
  root: PLACEHOLDER,
  realpath: (p) => p,
  home: "/home/user",
  tmp: [],
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

function compareRecorded(): Comparison {
  return classify(
    normaliseReport(recorded("jest"), "jest", posixCtx),
    normaliseReport(recorded("vitest"), "vitest", posixCtx),
    {
      snapshotHint: (file) =>
        file === "src/snapshot-unrecorded.check.js" ? "no-vitest-snapshot" : undefined,
    },
  );
}

describe("compare: classifying recorded Jest 30 and Vitest 5 reports", () => {
  it("puts every test of the fixture in the bucket its two results call for", () => {
    const c = compareRecorded();
    expect(bucketsOf(c)).toEqual(sorted(EXPECTED));
    expect(c.counts).toEqual({
      "same-pass": 8,
      "same-fail": 1,
      "same-skip": 1,
      regression: 5,
      improvement: 2,
      "skip-difference": 1,
      "only-jest": 2,
      "only-vitest": 2,
    });
  });

  it("claims nothing: 12 of the 16 tests that pass under Jest have no confirmed Vitest result", () => {
    const c = compareRecorded();
    expect(c.jestPassed).toBe(16);
    // The four it.each tests match only in shape, so they are listed, not confirmed.
    expect(c.confirmed).toBe(4);
    expect(c.claimHolds).toBe(false);
  });

  it("matches it.each tests by position, in shape only, when the runners print their values differently", () => {
    const each = compareRecorded().entries.filter((e) => e.file === "src/each.check.js");
    expect(each.map((e) => e.vitestTitle)).toEqual(VITEST_EACH_TITLES);
    expect(each.map((e) => e.matchedBy)).toEqual(["shape", "shape", "shape", "shape"]);
  });

  it("does not match tests in different describe blocks by position", () => {
    const c = compareRecorded();
    const differ = c.entries.filter((e) => e.file === "src/runner-differences.check.js");
    expect(differ.some((e) => e.vitestTitle !== undefined)).toBe(false);
  });

  it("reads identities from the structured fields, files relative to the root", () => {
    const jest = normaliseReport(recorded("jest"), "jest", posixCtx);
    expect(
      jest.files.get("src/same.check.js")?.tests.map((t) => [t.ancestors, t.title]),
    ).toContainEqual([["math", "nested"], "multiplies"]);
    expect([...jest.files.keys()].every((f) => f.startsWith("src/"))).toBe(true);
  });

  it("keeps describe('a b') apart from describe('a') > describe('b'), which fullName joins alike", () => {
    const report = (ancestors: string[]) => ({
      testResults: [
        {
          name: "/project/x.test.js",
          status: "passed",
          message: "",
          assertionResults: [
            { ancestorTitles: ancestors, title: "c", fullName: "a b c", status: "passed" },
          ],
        },
      ],
    });
    const c = classify(
      normaliseReport(report(["a b"]), "jest", posixCtx),
      normaliseReport(report(["a", "b"]), "vitest", posixCtx),
    );
    expect(c.entries.map((e) => e.bucket).sort()).toEqual(["only-jest", "only-vitest"]);
  });

  it("treats a test as not run when its file failed outside any test", () => {
    const c = compareRecorded();
    const hook = c.entries.find((e) => e.file === "src/hook-fails-under-vitest.check.js");
    // Vitest reports a failing beforeAll as a failed file with an empty message and
    // its tests skipped.
    const raw = recorded("vitest").testResults.find((f) =>
      f.name.endsWith("hook-fails-under-vitest.check.js"),
    );
    expect(raw?.message).toBe("");
    expect(hook?.vitest).toMatchObject({
      status: "failed",
      rawStatus: "not run",
      notRun: "file-failed",
    });
    const load = c.entries.find((e) => e.file === "src/collect-fails-under-vitest.check.js");
    expect(load?.vitest?.message).toBe("cannot load this file under Vitest");
    expect(c.files.brokenVitest.map((f) => f.file)).toEqual([
      "src/collect-fails-under-vitest.check.js",
      "src/hook-fails-under-vitest.check.js",
    ]);
  });

  it("asks for a snapshot hint only on snapshot-mismatch regressions", () => {
    const asked: string[] = [];
    classify(
      normaliseReport(recorded("jest"), "jest", posixCtx),
      normaliseReport(recorded("vitest"), "vitest", posixCtx),
      {
        snapshotHint: (file) => {
          asked.push(file);
          return undefined;
        },
      },
    );
    expect(asked).toEqual(["src/snapshot-unrecorded.check.js"]);
  });

  it("matches Jest's backslash paths with Vitest's forward-slash paths on Windows", () => {
    const toWindows = (json: ReturnType<typeof recorded>, sep: "\\" | "/") => ({
      ...json,
      testResults: json.testResults.map((f) => ({
        ...f,
        name: `C:${f.name.replace(/\//g, sep)}`,
        message: f.message.split(PLACEHOLDER).join(sep === "\\" ? "C:\\project" : "C:/project"),
      })),
    });
    const ctx: NormaliseContext = {
      root: "C:\\project",
      realpath: (p) => p,
      home: "C:\\Users\\u",
      tmp: [],
    };
    const c = classify(
      normaliseReport(toWindows(recorded("jest"), "\\"), "jest", ctx),
      normaliseReport(toWindows(recorded("vitest"), "/"), "vitest", ctx),
    );
    expect(bucketsOf(c)).toEqual(sorted(EXPECTED));
    expect(relativeFile("c:/project/src/a.js", ctx)).toBe("src/a.js");
  });

  it("resolves symlinked spellings of the root", () => {
    const ctx: NormaliseContext = {
      root: "/tmp/project",
      realpath: (p) => p.replace(/^\/tmp\//, "/private/tmp/"),
    };
    expect(relativeFile("/private/tmp/project/src/a.js", ctx)).toBe("src/a.js");
    expect(relativeFile("/tmp/project/src/a.js", ctx)).toBe("src/a.js");
  });
});

describe("compare: the claim has a floor", () => {
  const jest = () => normaliseReport(recorded("jest"), "jest", posixCtx);
  const empty = () => normaliseReport({ testResults: [] }, "vitest", posixCtx);

  it("does not hold when Vitest collected nothing, though there is no regression", () => {
    const c = classify(jest(), empty(), {
      vitestRun: { exitCode: 0, errors: [], engine: "native" },
    });
    expect(c.counts.regression).toBe(0);
    expect(c.claimHolds).toBe(false);
    expect(c.files.onlyJest).toHaveLength(9);
    const text = renderComparison(c, {
      jest: { version: "30.2.0", config: "package.json#jest" },
      vitest: { version: "5.0.5", config: "vitest.config.mjs" },
      top: 3,
    }).join("\n");
    expect(text).toContain(
      "✗ 16 of the 16 tests that pass under Jest do not pass under Vitest (engine: native)",
    );
    expect(text).toContain("16 not collected");
    expect(text).toContain("! Test files only Jest collected (9):");
    expect(text).toContain("… and 6 more (see --json)");
  });

  it("does not hold when no test passed under Jest", () => {
    const c = classify(normaliseReport({ testResults: [] }, "jest", posixCtx), empty());
    expect(c.claimHolds).toBe(false);
  });

  const report = (statuses: string[]) => ({
    testResults: [
      {
        name: "/project/a.test.js",
        status: statuses.includes("failed") ? "failed" : "passed",
        message: "",
        assertionResults: statuses.map((status, i) => ({
          ancestorTitles: [],
          title: `t${i}`,
          status,
          failureMessages: status === "failed" ? ["Error: x"] : [],
        })),
      },
    ],
  });

  it("holds when every Jest pass passes under Vitest and `vitest run` exits 0", () => {
    const c = classify(
      normaliseReport(report(["passed", "failed"]), "jest", posixCtx),
      normaliseReport(report(["passed", "passed"]), "vitest", posixCtx),
      { vitestRun: { exitCode: 0, errors: [], engine: "native" } },
    );
    expect(c.claimHolds).toBe(true);
    expect(c.counts.improvement).toBe(1);
  });

  it("does not hold when `vitest run` exits 1, even if every Jest pass also passes", () => {
    const c = classify(
      normaliseReport(report(["passed", "failed"]), "jest", posixCtx),
      normaliseReport(report(["passed", "failed"]), "vitest", posixCtx),
    );
    expect(c.confirmed).toBe(c.jestPassed);
    expect(c.claimHolds).toBe(false);
    expect(c.vitest.problems).toEqual(["1 test fails under Vitest (1 fail under Jest too)"]);
  });

  it("rejects a file that is not a runner report instead of reading it as an empty run", () => {
    expect(() => normaliseReport({ results: [] }, "jest", posixCtx)).toThrow(
      /no testResults array/,
    );
  });
});

describe("compare: messages carry no stack, code frame or path", () => {
  it("drops Jest's colourised code frame and stack", () => {
    const raw = recorded("jest").testResults.find((f) =>
      f.name.endsWith("collect-fails-under-jest.check.js"),
    );
    // oxlint-disable-next-line no-control-regex -- ANSI escapes
    const plain = (raw?.message ?? "").replace(/\u001b\[[0-9;]*m/g, "");
    expect(plain).toMatch(/>\s*1 \|/);
    expect(plain).toContain("at Object.<anonymous>");
    const jest = normaliseReport(recorded("jest"), "jest", posixCtx);
    const message = jest.files.get("src/collect-fails-under-jest.check.js")?.message ?? "";
    expect(message).toBe("● Test suite failed to run\n\n    cannot load this file under Jest");
    expect(firstLine(message)).toBe("cannot load this file under Jest");
  });

  it("cuts at the first stack frame and replaces the root and home directory", () => {
    const text = sanitizeMessage(
      "\u001b[31mError: nope /r/src/a.js and /h/x\u001b[39m\n    at f (/r/src/a.js:1:1)\n    at g",
      { roots: ["/r"], home: "/h" },
    );
    expect(text).toBe("Error: nope <root>/src/a.js and ~/x");
  });

  it("groups regressions by first Vitest error, largest group first", () => {
    const groups = clusters(
      compareRecorded().entries.filter((e) => e.bucket === "regression"),
      "vitest",
    );
    expect(groups[0]).toMatchObject({ message: "cannot load this file under Vitest", count: 2 });
    expect(groups.map((g) => g.count)).toEqual([2, 1, 1, 1]);
  });
});

describe("compare: arguments", () => {
  it("splits argument strings with quotes", () => {
    expect(splitArgs(`--testNamePattern "a b|c" -t 'x y'`)).toEqual([
      "--testNamePattern",
      "a b|c",
      "-t",
      "x y",
    ]);
  });

  it("does not read a flag's value as the command", async () => {
    const lines: string[] = [];
    expect(await main(["--json", "out.json", "frobnicate"], (l) => lines.push(l))).toBe(1);
    expect(lines.join("\n")).toContain("unknown command 'frobnicate'");
  });

  it("parses --jest-args=… and --top", () => {
    expect(parseCompareArgs(["--jest-args=--maxWorkers=2", "--top", "3"])).toMatchObject({
      jestArgs: ["--maxWorkers=2"],
      top: 3,
    });
  });
});

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
