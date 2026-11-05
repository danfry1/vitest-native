/**
 * `vitest-native compare` (docs/compare-mode.md).
 *
 * The recorded reports in fixtures/compare-reports/ are real Jest 30.2.0 `--json` and
 * Vitest 5.0.5 JSON-reporter output for fixtures/compare-project/, whose test files
 * behave differently under the two runners on purpose (`*.check.js`, so this suite does
 * not collect them). Paths in them are placeholders (/project for the root).
 *
 * The end-to-end tests, which run Vitest (and Jest with VN_COMPARE_JEST), are in
 * cli-compare.e2e.test.ts. The cases an adversarial review found are in
 * cli-compare-edges.test.ts and cli-compare-edges.e2e.test.ts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
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
import { parseCompareArgs, splitArgs } from "../src/cli/compare-run.js";

const here = path.dirname(fileURLToPath(import.meta.url));
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

  it("claims nothing: 11 of the 16 tests that pass under Jest have no confirmed Vitest result", () => {
    const c = compareRecorded();
    expect(c.jestPassed).toBe(16);
    // Three it.each tests match only in shape, so they are listed, not confirmed. The %p
    // row differs only where Vitest left %p unformatted and pairs one to one: confirmed.
    expect(c.confirmed).toBe(5);
    expect(c.claimHolds).toBe(false);
  });

  it("matches it.each tests by position: a literal %p row is confirmed, other printed values only in shape", () => {
    const each = compareRecorded().entries.filter((e) => e.file === "src/each.check.js");
    expect(each.map((e) => e.vitestTitle)).toEqual(VITEST_EACH_TITLES);
    expect(each.map((e) => e.matchedBy)).toEqual(["shape", "position", "shape", "shape"]);
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
