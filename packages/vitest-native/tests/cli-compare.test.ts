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
 * bucket the recorded ones do. VN_COMPARE_RECORD=1 re-records both reports from that run (then run oxfmt on
 * fixtures/compare-reports/).
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
import { parseCompareArgs, splitArgs } from "../src/cli/compare-run.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.join(here, "fixtures", "compare-project");
const REPORTS = path.join(here, "fixtures", "compare-reports");
const PLACEHOLDER = "/project";

const recorded = (name: "jest" | "vitest") =>
  JSON.parse(fs.readFileSync(path.join(REPORTS, `${name}.json`), "utf8")) as {
    testResults: Array<{ name: string; message: string; assertionResults: unknown[] }>;
  };

/** Placeholder paths need no symlink resolution. */
const posixCtx: NormaliseContext = { root: PLACEHOLDER, realpath: (p) => p, home: "/home/user" };

/** Every test of the fixture, and the bucket its two results put it in. */
const EXPECTED: Array<[Bucket, string, string[], string]> = [
  ["improvement", "src/collect-fails-under-jest.check.js", [], "loads under Vitest"],
  ["regression", "src/collect-fails-under-vitest.check.js", [], "first"],
  ["regression", "src/collect-fails-under-vitest.check.js", [], "second"],
  ["regression", "src/hook-fails-under-vitest.check.js", ["with setup"], "needs the setup"],
  ["only-jest", "src/jest-only.check.js", [], "runs under Jest only"],
  ["regression", "src/runner-differences.check.js", ["globals"], "uses the jest global"],
  ["improvement", "src/runner-differences.check.js", ["globals"], "uses the vi global"],
  ["skip-difference", "src/runner-differences.check.js", [], "is skipped under Vitest only"],
  ["only-jest", "src/runner-differences.check.js", [], "exists under Jest only"],
  ["only-vitest", "src/runner-differences.check.js", [], "exists under Vitest only"],
  ["same-pass", "src/same.check.js", ["math"], "adds"],
  ["same-pass", "src/same.check.js", ["math", "nested"], "multiplies"],
  ["same-pass", "src/same.check.js", ["math"], "repeats a title"],
  ["same-pass", "src/same.check.js", ["math"], "repeats a title"],
  ["same-fail", "src/same.check.js", [], "fails under both runners"],
  ["same-skip", "src/same.check.js", [], "is skipped under both runners"],
  ["regression", "src/snapshot-unrecorded.check.js", ["badge"], "renders"],
  ["same-pass", "src/snapshot.check.js", ["card"], "renders"],
  ["only-vitest", "src/vitest-only.check.js", [], "runs under Vitest only"],
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
    { vitestSnapshotRecorded: (file) => file === "src/snapshot.check.js" },
  );
}

describe("compare: classifying recorded Jest 30 and Vitest 5 reports", () => {
  it("puts every test of the fixture in the bucket its two results call for", () => {
    const c = compareRecorded();
    expect(bucketsOf(c)).toEqual(sorted(EXPECTED));
    expect(c.counts).toEqual({
      "same-pass": 5,
      "same-fail": 1,
      "same-skip": 1,
      regression: 5,
      improvement: 2,
      "skip-difference": 1,
      "only-jest": 2,
      "only-vitest": 2,
    });
  });

  it("claims nothing: 8 of the 13 tests that pass under Jest have no passing Vitest result", () => {
    const c = compareRecorded();
    expect(c.jestPassed).toBe(13);
    expect(c.confirmed).toBe(5);
    expect(c.claimHolds).toBe(false);
  });

  it("reads identities from the structured fields, files relative to the root", () => {
    const jest = normaliseReport(recorded("jest"), "jest", posixCtx);
    const same = jest.files.get("src/same.check.js");
    expect(same?.tests.map((t) => [t.ancestors, t.title])).toContainEqual([
      ["math", "nested"],
      "multiplies",
    ]);
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

  it("marks a snapshot failure as unrecorded only where Vitest has no snapshot file", () => {
    const c = compareRecorded();
    const badge = c.entries.find((e) => e.file === "src/snapshot-unrecorded.check.js");
    expect(badge?.hint).toBe("no-vitest-snapshot");
    const without = classify(
      normaliseReport(recorded("jest"), "jest", posixCtx),
      normaliseReport(recorded("vitest"), "vitest", posixCtx),
    );
    expect(without.entries.some((e) => e.hint)).toBe(false);
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
    const ctx: NormaliseContext = { root: "C:\\project", realpath: (p) => p, home: "C:\\Users\\u" };
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
    const c = classify(jest(), empty());
    expect(c.counts.regression).toBe(0);
    expect(c.claimHolds).toBe(false);
    expect(c.files.onlyJest).toHaveLength(8);
    const text = renderComparison(c, {
      jest: { version: "30.2.0", config: "package.json#jest" },
      vitest: { version: "5.0.5", config: "vitest.config.mjs" },
      top: 3,
    }).join("\n");
    expect(text).toContain("✗ 13 of the 13 tests that pass under Jest do not pass under Vitest");
    expect(text).toContain("13 not collected");
    expect(text).toContain("! Test files only Jest collected (8):");
    expect(text).toContain("… and 5 more (see --json)");
  });

  it("does not hold when no test passed under Jest", () => {
    const c = classify(normaliseReport({ testResults: [] }, "jest", posixCtx), empty());
    expect(c.claimHolds).toBe(false);
  });

  it("holds when every Jest pass also passes under Vitest, even with Jest failures", () => {
    const report = (status: string) => ({
      testResults: [
        {
          name: "/project/a.test.js",
          status,
          message: "",
          assertionResults: [
            { ancestorTitles: [], title: "ok", status: "passed" },
            {
              ancestorTitles: [],
              title: "bad",
              status,
              failureMessages: status === "failed" ? ["Error: x"] : [],
            },
          ],
        },
      ],
    });
    const c = classify(
      normaliseReport(report("failed"), "jest", posixCtx),
      normaliseReport(report("passed"), "vitest", posixCtx),
    );
    expect(c.claimHolds).toBe(true);
    expect(c.counts.improvement).toBe(1);
  });

  it("rejects a file that is not a runner report instead of reading it as an empty run", () => {
    expect(() => normaliseReport({ results: [] }, "jest", posixCtx)).toThrow(
      /no testResults array/,
    );
  });
});

describe("compare: messages carry no source", () => {
  it("drops Jest's code frame and stack, and the root's path", () => {
    const raw = recorded("jest").testResults.find((f) =>
      f.name.endsWith("collect-fails-under-jest.check.js"),
    );
    // The recorded report has a colourised code frame and a stack in it.
    // oxlint-disable-next-line no-control-regex -- ANSI escapes
    const plain = (raw?.message ?? "").replace(/\u001b\[[0-9;]*m/g, "");
    expect(plain).toMatch(/>\s*1 \|/);
    expect(plain).toContain("at Object.<anonymous>");
    const jest = normaliseReport(recorded("jest"), "jest", posixCtx);
    const message = jest.files.get("src/collect-fails-under-jest.check.js")?.message ?? "";
    expect(message).toContain("cannot load this file under Jest");
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

  it("refuses flags that would write snapshots or replace compare's reports", () => {
    for (const bad of [
      ["--jest-args", "-u"],
      ["--jest-args", "--ci=false"],
      ["--vitest-args", "--update"],
      ["--vitest-args", "--reporter=dot"],
      ["--vitest-args", "--config x"],
    ]) {
      expect(parseCompareArgs(bad)).toHaveProperty("error");
    }
    expect(parseCompareArgs(["--jest-args=--maxWorkers=2", "--top", "3"])).toMatchObject({
      jestArgs: ["--maxWorkers=2"],
      top: 3,
    });
  });

  it("does not read a flag's value as the command", async () => {
    const lines: string[] = [];
    expect(await main(["--json", "out.json", "frobnicate"], (l) => lines.push(l))).toBe(1);
    expect(lines.join("\n")).toContain("unknown command 'frobnicate'");
  });
});

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

/** The directory of an installed package, found from this repository. */
function packageDir(name: string): string {
  for (let dir = here; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
    if (path.dirname(dir) === dir) throw new Error(`${name} is not installed`);
  }
}

/** A copy of the fixture project with Vitest (and Jest, when given) linked in. */
function project(jestDir?: string): string {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-compare-e2e-"));
  fs.cpSync(PROJECT, root, { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules"));
  // A junction on Windows needs no privilege; elsewhere the type is ignored.
  fs.symlinkSync(packageDir("vitest"), path.join(root, "node_modules", "vitest"), "junction");
  if (jestDir) fs.symlinkSync(jestDir, path.join(root, "node_modules", "jest"), "junction");
  return root;
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

function snapshotFiles(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dir of ["__snapshots__", "__vitest_snapshots__"]) {
    const abs = path.join(root, "src", dir);
    for (const f of fs.existsSync(abs) ? fs.readdirSync(abs) : []) {
      out[`${dir}/${f}`] = fs.readFileSync(path.join(abs, f), "utf8");
    }
  }
  return out;
}

async function runCli(args: string[]): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  const code = await main(["compare", ...args], (l) => lines.push(l));
  return { code, text: lines.join("\n") };
}

describe("compare: end to end with Vitest and a recorded Jest report", () => {
  it("runs Vitest, classifies, writes the report, and leaves both runners' snapshots alone", async () => {
    const root = project();
    const before = snapshotFiles(root);
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
    expect(text).toContain("✗ 8 of the 13 tests that pass under Jest do not pass under Vitest");
    expect(text).toContain("snapshots read from __vitest_snapshots__/");
    expect(text).toMatch(/2× cannot load this file under Vitest/);
    expect(text).toContain("no Vitest snapshot recorded");
    expect(text).toContain("src/jest-only.check.js (1 test, passed)");

    const report = JSON.parse(fs.readFileSync(out, "utf8"));
    expect(report.format).toBe("vitest-native-compare@1");
    expect(report.verdict).toMatchObject({ holds: false, jestPassed: 13, confirmed: 5 });
    // The live Vitest run lands every test where the recorded one did.
    const listed = report.tests.map(
      (t: { bucket: Bucket; file: string; ancestors: string[]; title: string }) => [
        t.bucket,
        t.file,
        t.ancestors,
        t.title,
      ],
    );
    expect(sorted(listed)).toEqual(
      sorted(EXPECTED.filter(([b]) => b !== "same-pass" && b !== "same-skip")),
    );
    // No absolute path or temp directory leaks into the report.
    expect(JSON.stringify(report)).not.toContain(root);
    expect(JSON.stringify(report)).not.toContain(os.homedir());

    // Jest's .snap files are byte-identical (Vitest rewrites their header when it reads
    // them, even under CI); Vitest read its own and recorded nothing new.
    expect(snapshotFiles(root)).toEqual(before);
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
      "nothing.config.mjs",
    ]);
    expect(code).toBe(1);
    expect(text).toContain("13 not collected");
    expect(text).toContain("! Test files only Jest collected (8):");
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
    const before = snapshotFiles(root);
    const raw = path.join(root, "..", `${path.basename(root)}-raw`);
    const lines: string[] = [];
    const { runCompare, parseCompareArgs: parse } = await import("../src/cli/compare-run.js");
    const parsed = parse(["--root", root]);
    if ("error" in parsed) throw new Error(parsed.error);
    const code = await runCompare({ ...parsed, log: (l) => lines.push(l), rawReportsDir: raw });
    expect(code, lines.join("\n")).toBe(1);
    expect(snapshotFiles(root)).toEqual(before);

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
