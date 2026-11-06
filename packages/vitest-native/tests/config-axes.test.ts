/**
 * The configuration-axis matrix's own machinery (validation/config-axes, documented in
 * docs/config-axis-matrix.md): the pairwise generator, the known-failing verdict, and
 * the catalog's consistency. The probes themselves run only in the matrix's CI jobs,
 * against a packed install; this suite checks that what the jobs are told to run, and
 * how their results are judged, cannot quietly cover less than it says.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import {
  allowed,
  cartesian,
  CELLS_PER_JOB,
  cellsFor,
  jobsFor,
  readAxes,
  scopeFor,
} from "../validation/config-axes/cells.mjs";
// @ts-expect-error — runtime .mjs, no types
import {
  activeProbes,
  applies,
  PROBES,
  runs as canRun,
} from "../validation/config-axes/probes.mjs";
// @ts-expect-error — runtime .mjs, no types
import { must, sh } from "../validation/config-axes/sh.mjs";
// @ts-expect-error — runtime .mjs, no types
import { fileResults, runProblems } from "../validation/config-axes/accounting.mjs";
import {
  judgeSupport,
  ownershipModelArgument,
  ownershipSupport,
  UNSUPPORTED,
  // @ts-expect-error — runtime .mjs, no types
} from "../validation/config-axes/ownership.mjs";
// @ts-expect-error — runtime .mjs, no types
import { OWNERSHIP_MARKER, wrapForOwnership } from "../validation/bug-museum/lib/materialise.mjs";
// @ts-expect-error — runtime .mjs, no types
import { isExpoPackage } from "../validation/config-axes/local-install.mjs";
import {
  judge,
  matchingEntries,
  genericFailureLines,
  readKnownFailing,
  validateEntries,
  // @ts-expect-error — runtime .mjs, no types
} from "../validation/config-axes/verdict.mjs";

type Row = Record<string, string>;
type Cell = Row & { runs: (Row & { env?: Row })[] };

const axes = readAxes();
const allAxes: Record<string, string[]> = { ...axes.install, ...axes.runtime };
const names = Object.keys(allAxes);
// The axis combinations, without the extra runs (axes.json `extraRuns`), which repeat
// some combination's judged values with settings of their own.
const rowsOf = (cells: Cell[]): Row[] =>
  cells.flatMap(({ runs, ...install }) =>
    runs.filter((run) => !run.env).map((run) => ({ ...install, ...run })),
  );
const allowedRows: Row[] = cartesian(allAxes).filter((row: Row) => allowed(row, axes.constraints));

describe("cells", () => {
  it("pairwise: every pair of axis values that some allowed run has is covered", () => {
    const rows = rowsOf(cellsFor(axes, "pairwise"));
    const missing: string[] = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const [a, b] = [names[i], names[j]];
        for (const x of allAxes[a]) {
          for (const y of allAxes[b]) {
            const possible = allowedRows.some((row) => row[a] === x && row[b] === y);
            const covered = rows.some((row) => row[a] === x && row[b] === y);
            if (possible && !covered) missing.push(`${a}=${x} & ${b}=${y}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("pairwise: no run breaks a constraint, and no install is a job twice", () => {
    const cells: Cell[] = cellsFor(axes, "pairwise");
    for (const row of rowsOf(cells))
      expect(allowed(row, axes.constraints), JSON.stringify(row)).toBe(true);
    const keys = cells.map(({ vitest, rntl, layout }) => `${vitest}/${rntl}/${layout}`);
    expect(new Set(keys).size).toBe(keys.length);
    // The job count is the cost on every pull request; it is the largest install pair.
    const largestPair = Math.max(
      ...Object.values(axes.install as Record<string, string[]>).flatMap((a, i, all) =>
        all.slice(i + 1).map((b) => a.length * b.length),
      ),
    );
    expect(cells.length).toBe(largestPair);
  });

  it("every cell, in either scope, carries the extra runs, each judged as an allowed combination", () => {
    for (const scope of ["pairwise", "full"]) {
      for (const cell of cellsFor(axes, scope) as Cell[]) {
        const { runs, ...install } = cell;
        const extra = runs.filter((run) => run.env);
        for (const run of extra as (Row & { excludes?: string[] })[]) {
          const ids = activeProbes(PROBES, cell, run).map((p: { id: string }) => p.id);
          for (const id of run.excludes ?? []) expect(ids, run.label).not.toContain(id);
        }
        expect(extra.map((run) => run.label)).toEqual(axes.extraRuns.map((r: Row) => r.label));
        for (const { label: _l, env: _e, excludes: _x, resolve: _r, ...judged } of extra as Row[]) {
          const row = { ...install, ...judged };
          expect(
            allowedRows.some((r) => JSON.stringify(r) === JSON.stringify(row)),
            JSON.stringify(row),
          ).toBe(true);
        }
      }
    }
  });

  it("CI jobs run every cell of each scope exactly once, at most CELLS_PER_JOB a job", () => {
    for (const scope of ["pairwise", "full"]) {
      const cells = cellsFor(axes, scope);
      const jobs: unknown[][] = jobsFor(cells);
      expect(jobs.every((job) => job.length >= 1 && job.length <= CELLS_PER_JOB)).toBe(true);
      expect(jobs.flat()).toEqual(cells);
      expect(jobs.length).toBe(Math.ceil(cells.length / CELLS_PER_JOB));
    }
  });

  it("pairwise is deterministic", () => {
    expect(cellsFor(axes, "pairwise")).toEqual(cellsFor(axes, "pairwise"));
  });

  it("full: every allowed combination of every axis, once", () => {
    const rows = rowsOf(cellsFor(axes, "full"));
    expect(rows.length).toBe(allowedRows.length);
    expect(new Set(rows.map((row) => JSON.stringify(row))).size).toBe(rows.length);
  });

  it("pull requests run pairwise unless they change the matrix itself", () => {
    expect(scopeFor("pull_request", ["packages/vitest-native/src/plugin.ts"])).toBe("pairwise");
    expect(
      scopeFor("pull_request", [
        "packages/vitest-native/validation/config-axes/known-failing.json",
      ]),
    ).toBe("full");
    expect(scopeFor("pull_request", [".github/workflows/config-axis-matrix.yml"])).toBe("full");
    expect(scopeFor("push", [])).toBe("full");
    expect(scopeFor("schedule", [])).toBe("full");
  });
});

describe("verdict", () => {
  const entries = [
    {
      probe: "p",
      when: { engine: "native", rntl: ["12", "13"] },
      failure: "^p\\.test\\.ts: cleans up: AssertionError: expected 0 to be 1",
      fixedBy: "#1",
    },
  ];
  const expected = {
    status: "fail",
    failures: ["p.test.ts: cleans up: AssertionError: expected 0 to be 1"],
  };
  const run = (over: Row) => ({ ...allowedRows[0], engine: "native", rntl: "12", ...over });

  it("a listed failure is known; an unlisted one is a regression", () => {
    expect(judge(entries, "p", run({}), expected)).toMatchObject({
      outcome: "known",
      ok: true,
    });
    expect(judge(entries, "p", run({ rntl: "14" }), expected)).toMatchObject({
      outcome: "REGRESSION",
      ok: false,
    });
    expect(judge(entries, "other", run({}), expected)).toMatchObject({ ok: false });
  });

  // The masking hole the 2026-10 harness audit found: any failure of a listed probe read
  // as "known", a crash included.
  it("a listed probe failing some other way is a regression, not the known bug", () => {
    for (const failures of [
      ["p.test.ts: did not run", "the process was killed by SIGSEGV"],
      ["p.test.ts: cleans up: TypeError: Cannot read properties of undefined (reading 'x')"],
      ["no report: the run crashed"],
      [],
    ]) {
      expect(
        judge(entries, "p", run({}), { status: "fail", failures }),
        failures.join(),
      ).toMatchObject({
        outcome: "REGRESSION",
        ok: false,
      });
    }
  });

  it("consequences count only beside the entry's own failure", () => {
    const withConsequences = [
      {
        ...entries[0],
        consequences: "^file accounting: no result in the JSON report for p\\.test\\.ts$",
      },
    ];
    const lost = "file accounting: no result in the JSON report for p.test.ts";
    expect(
      judge(withConsequences, "p", run({}), {
        status: "fail",
        failures: [...expected.failures, lost],
      }),
    ).toMatchObject({ outcome: "known", ok: true });
    // The #350 class: a lost file with no error beside it is not the known bug.
    expect(
      judge(withConsequences, "p", run({}), { status: "fail", failures: [lost] }),
    ).toMatchObject({
      outcome: "REGRESSION",
      ok: false,
    });
  });

  it("a consequence cannot account for every file of the probe being lost", () => {
    const pair = [
      {
        probe: "p",
        when: { engine: "native" },
        failure: "^unhandled error: E: the bug$",
        consequences: "^[ab]\\.test\\.ts: did not run$",
        fixedBy: "#1",
      },
    ];
    const result = (...lost: string[]) => ({
      status: "fail",
      failures: ["unhandled error: E: the bug", ...lost.map((f) => `${f}: did not run`)],
      files: ["a.test.ts", "b.test.ts"],
    });
    expect(judge(pair, "p", run({}), result("b.test.ts"))).toMatchObject({ outcome: "known" });
    expect(judge(pair, "p", run({}), result("a.test.ts", "b.test.ts"))).toMatchObject({
      outcome: "REGRESSION",
      ok: false,
    });
  });

  // Two entries on one probe: one bug fixed, its entry left behind. Per-probe judgement
  // called the remaining failure "known" and would credit a later regression of the fixed
  // bug to its merged PR.
  it("an applying entry whose failure no line matches is stale, even while the probe fails", () => {
    const two = [
      {
        probe: "p",
        when: { engine: "native" },
        failure: "^p\\.test\\.ts: t: AssertionError: A",
        fixedBy: "#1",
      },
      {
        probe: "p",
        when: { engine: "native" },
        failure: "^p\\.test\\.ts: t: AssertionError: B",
        fixedBy: "#2",
      },
    ];
    const lines = (...ids: string[]) => ids.map((id) => `p.test.ts: t: AssertionError: ${id}`);
    expect(judge(two, "p", run({}), { status: "fail", failures: lines("A", "B") })).toMatchObject({
      outcome: "known",
    });
    for (const only of ["A", "B"]) {
      expect(judge(two, "p", run({}), { status: "fail", failures: lines(only) })).toMatchObject({
        outcome: "STALE",
        ok: false,
      });
    }
  });

  it("every failure line must match: the known failure beside another one is a regression", () => {
    const failures = [...expected.failures, "unhandled error: Error: stray"];
    expect(judge(entries, "p", run({}), { status: "fail", failures })).toMatchObject({
      outcome: "REGRESSION",
      ok: false,
    });
  });

  it("a listed probe that passes is stale, so the list can only shrink", () => {
    expect(judge(entries, "p", run({}), { status: "pass" })).toMatchObject({
      outcome: "STALE",
      ok: false,
    });
    expect(judge(entries, "p", run({ engine: "mock" }), { status: "pass" })).toMatchObject({
      outcome: "pass",
      ok: true,
    });
  });

  it("a probe that cannot observe its defect is neither a pass nor a failure", () => {
    expect(judge(entries, "p", run({}), { status: "n/a" })).toMatchObject({
      outcome: "n/a",
      ok: true,
    });
  });

  it("an entry without `when` matches every run", () => {
    expect(matchingEntries([{ probe: "p", fixedBy: "#1" }], "p", run({}))).toHaveLength(1);
  });
});

describe("workspaces linked from this package's install", () => {
  it("leave out Expo's packages, which a workspace that does not declare expo would not have", () => {
    for (const name of ["expo", "expo-constants", "expo-status-bar", "@expo/config"])
      expect(isExpoPackage(name), name).toBe(true);
    for (const name of [
      "react-native",
      "expostore",
      "@testing-library/react-native",
      "museum-expo",
    ])
      expect(isExpoPackage(name), name).toBe(false);
  });
});

describe("known-failing.json", () => {
  const known = readKnownFailing();

  it("names real probes, real axis values, a fixing PR and a reason", () => {
    expect(validateEntries(known, axes, PROBES)).toEqual([]);
    expect(
      validateEntries(
        [{ probe: "nope", when: { engin: "native", rntl: "11" }, fixedBy: "342" }],
        axes,
        PROBES,
      ),
    ).toHaveLength(6);
  });

  it("every entry matches some allowed run where its probe applies — otherwise it could never go stale", () => {
    // run.mjs judges every run with its ownershipModel (a flag: "off" unless --ownership
    // asks for another value where the constraints allow it), so an entry may name it.
    const judgedRows = allowedRows.flatMap((row) =>
      (axes.flags.ownershipModel as string[])
        .map((ownershipModel) => ({ ...row, ownershipModel }))
        .filter((judged) => allowed(judged, axes.constraints)),
    );
    const unreachable = known.filter((entry: { probe: string }) => {
      const probe = PROBES.find((p: { id: string }) => p.id === entry.probe);
      return !judgedRows.some(
        (row) => applies(probe, row) && matchingEntries([entry], entry.probe, row).length > 0,
      );
    });
    expect(unreachable).toEqual([]);
  });

  it("every signature is specific: it matches none of its own probe's generic failure lines", () => {
    const probe = PROBES[0];
    const entry = { probe: probe.id, fixedBy: "#1", why: "x" };
    const file = probe.files[0].replaceAll(".", "\\.");
    for (const failure of [
      ".*",
      "did not run",
      "TypeError",
      "(",
      "^$|x",
      `^${file}: did not run$`,
      // A multi-run suite's `run N: ` prefix, and runProblems' own crash wording.
      "^run 2: .*",
      "^no JSON report",
    ]) {
      expect(validateEntries([{ ...entry, failure }], axes, PROBES), failure).toHaveLength(1);
    }
    expect(validateEntries([{ ...entry, failure: "expected 0 to be 1" }], axes, PROBES)).toEqual(
      [],
    );
    // `consequences` may match only lost files and exit codes: `.+` would absorb a
    // TypeError beside the bug.
    for (const consequences of [
      ".+",
      "TypeError",
      "unhandled error",
      "AssertionError",
      "^$",
      "^run 2: .*",
      "no JSON report: the run crashed",
    ]) {
      expect(
        validateEntries([{ ...entry, failure: "expected 0 to be 1", consequences }], axes, PROBES),
        consequences,
      ).toHaveLength(1);
    }
    expect(
      validateEntries(
        [{ ...entry, failure: "expected 0 to be 1", consequences: `^${file}: did not run$` }],
        axes,
        PROBES,
      ),
    ).toEqual([]);
    for (const { probe: id, failure } of known) {
      const lines = genericFailureLines(PROBES.find((p: { id: string }) => p.id === id));
      for (const line of lines)
        expect(new RegExp(failure).test(line), `${id}: ${line}`).toBe(false);
    }
  });
});

describe("run-level accounting", () => {
  const report = (files: Record<string, "passed" | "failed">) => ({
    success: Object.values(files).every((s) => s === "passed"),
    testResults: Object.entries(files).map(([name, status]) => ({
      name: `/w/probes/${name}`,
      status,
      assertionResults: [
        { title: "t", status, failureMessages: status === "failed" ? ["expected 0 to be 1"] : [] },
      ],
    })),
  });
  const accounting = (files: Record<string, string>, unhandledErrors: object[] = []) => ({
    reason: "passed",
    modules: Object.entries(files).map(([name, state]) => ({ file: `/w/probes/${name}`, state })),
    unhandledErrors,
  });
  const exit = (status: number | null, signal: string | null = null) => ({
    status,
    signal,
    timedOut: false,
  });

  // The JSON report keeps only "[vitest] There was an error when mocking a module", which
  // says nothing about why; a signature on it absorbed a TypeError in the factory.
  it("failure lines carry the cause chain the accounting reporter recorded", () => {
    const json = {
      testResults: [
        {
          name: "/w/probes/a.test.ts",
          status: "failed",
          message: "mocking failed\nmore",
          assertionResults: [],
        },
      ],
    };
    const record = {
      modules: [
        {
          file: "/w/probes/a.test.ts",
          state: "failed",
          errors: [
            { name: "Error", message: "mocking failed", causes: ["Error: Cannot find module 'x'"] },
          ],
          failedTests: [],
        },
      ],
    };
    expect(fileResults(json, record)["a.test.ts"].failures).toEqual([
      "a.test.ts: mocking failed (caused by: Error: Cannot find module 'x')",
    ]);
    expect(fileResults(json, null)["a.test.ts"].failures).toEqual(["a.test.ts: mocking failed"]);
  });

  it("a clean run and a run whose failures explain its exit have no problems", () => {
    const files = { "a.test.ts": "passed", "b.test.ts": "passed" } as const;
    expect(runProblems(exit(0), Object.keys(files), report(files), accounting(files))).toEqual([]);
    const failing = { "a.test.ts": "failed", "b.test.ts": "passed" } as const;
    expect(
      runProblems(exit(1), Object.keys(failing), { ...report(failing) }, accounting(failing)),
    ).toEqual([]);
  });

  // The second hole: an unexplained exit was checked only when every probe passed.
  it("an unhandled error is reported beside a failing probe", () => {
    const files = { "a.test.ts": "failed" } as const;
    const problems = runProblems(
      exit(1),
      ["a.test.ts"],
      report(files),
      accounting(files, [{ name: "Error", message: "stray", testPath: "/w/probes/a.test.ts" }]),
    );
    expect(problems).toEqual(["unhandled error (from a.test.ts): Error: stray"]);
  });

  it("a file the run was given but never reported is a problem (#350's shape)", () => {
    const files = { "a.test.ts": "failed" } as const;
    const problems = runProblems(
      exit(1),
      ["a.test.ts", "b.test.ts"],
      report(files),
      accounting(files),
    );
    expect(problems).toEqual([
      "file accounting: no result in the JSON report for b.test.ts",
      "file accounting: Vitest never reported module b.test.ts",
    ]);
  });

  it("an exit code the results do not explain is a problem, whatever the probes did", () => {
    const passing = { "a.test.ts": "passed" } as const;
    expect(runProblems(exit(1), ["a.test.ts"], report(passing), accounting(passing))).toEqual([
      "Vitest exited 1, but no file failed and no error was unhandled",
      "the JSON report says success: true, but Vitest exited 1",
    ]);
    const failing = { "a.test.ts": "failed" } as const;
    expect(runProblems(exit(null, "SIGSEGV"), ["a.test.ts"], report(failing), null)).toEqual([
      "the process was killed by SIGSEGV",
      "no accounting record: the run ended before Vitest's onTestRunEnd",
    ]);
    expect(runProblems(exit(0), ["a.test.ts"], report(failing), accounting(failing))).toContain(
      "Vitest exited 0 with 1 failed files and 0 unhandled errors",
    );
  });
});

describe("harness processes", () => {
  it("a step that runs out of its time budget says it timed out", () => {
    const slow = sh(
      process.execPath,
      ["-e", "setTimeout(() => {}, 5000)"],
      process.cwd(),
      process.env,
      200,
    );
    expect(slow.timedOut).toBe(true);
    expect(() => must(slow, "npm install")).toThrow(/^npm install timed out/);
  });
});

describe("probe catalog", () => {
  const dir = path.resolve(
    import.meta.dirname,
    "../validation/config-axes/fixture/apps/app/probes",
  );

  it("every probe file belongs to exactly one probe, and every listed file exists", () => {
    const listed = PROBES.flatMap((probe: { files?: string[] }) => probe.files ?? []);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(fs.readdirSync(dir).sort());
  });

  it("every probe can observe its defect in some allowed run, and `requires` names real values", () => {
    const dead = PROBES.filter(
      (probe: { requires?: Row }) => !allowedRows.some((row) => applies(probe, row)),
    );
    expect(dead).toEqual([]);
    for (const probe of PROBES) {
      for (const [axis, value] of Object.entries(probe.requires ?? {})) {
        for (const v of [value].flat()) expect(allAxes[axis], `${probe.id} ${axis}`).toContain(v);
      }
    }
  });

  it("each cell's runs activate every probe that some allowed run of that cell can run", () => {
    for (const cell of cellsFor(axes, "full") as Cell[]) {
      const { runs: cellRuns, ...install } = cell;
      const ran = new Set(
        cellRuns.flatMap((run) => activeProbes(PROBES, cell, run).map((p: { id: string }) => p.id)),
      );
      const runnable = PROBES.filter((probe: { requires?: Row }) =>
        allowedRows.some(
          (row) => Object.entries(install).every(([a, v]) => row[a] === v) && canRun(probe, row),
        ),
      ).map((p: { id: string }) => p.id);
      expect([...ran].sort(), JSON.stringify(install)).toEqual(runnable.sort());
    }
  });

  // The review's coverage loss: a probe that cannot observe its defect in a cell still
  // asserts correct behaviour there, so it runs (and can regress) rather than being n/a.
  it("a probe runs wherever it can, not only where it can observe its defect", () => {
    const row = (over: Row) => ({ ...allowedRows[0], ...over });
    const byId = (id: string) => PROBES.find((p: { id: string }) => p.id === id);
    for (const [id, where] of [
      ["native-ext-peer", { engine: "native", layout: "hoisted" }],
      ["aliased-sibling-string", { engine: "mock", hot: "off" }],
      ["aliased-sibling-regex", { engine: "mock", hot: "off" }],
      ["aliased-source-import-meta", { engine: "mock", hot: "off" }],
      ["esm-default-interop", { engine: "mock", hot: "off" }],
      ["rntl-nested-text", { engine: "mock", hot: "off" }],
      ["recoverable-error", { rntl: "14" }],
    ] as [string, Row][]) {
      expect(canRun(byId(id), row(where)), id).toBe(true);
      expect(applies(byId(id), row(where)), id).toBe(false);
    }
  });

  it("ids are unique, and every probe names the bug it was written from", () => {
    const ids = PROBES.map((probe: { id: string }) => probe.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const probe of PROBES) expect(probe.bug, probe.id).toMatch(/^\S.{10,}$/);
  });
});

describe("the ownershipModel axis", () => {
  // A stand-in vitest-native whose reactNative() is `body`, in a fresh directory.
  const fakeBuild = (body: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-ownership-axis-"));
    fs.mkdirSync(path.join(dir, "dist"));
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "vitest-native",
        type: "module",
        exports: { ".": { default: "./dist/index.mjs" } },
      }),
    );
    fs.writeFileSync(
      path.join(dir, "dist/index.mjs"),
      `export const other = "kept";\nexport function reactNative(options) {\n${body}\n}\n`,
    );
    return dir;
  };

  it("is opt-in: a flag, not a runtime axis, so no CI cell changes", () => {
    expect(axes.flags.ownershipModel).toEqual(["off", "resolver", "resolution"]);
    expect(axes.runtime).not.toHaveProperty("ownershipModel");
    expect(ownershipModelArgument(undefined)).toBe("off");
    expect(ownershipModelArgument("resolution")).toBe("resolution");
    expect(() => ownershipModelArgument("bridge")).toThrow(/off, resolver, resolution/);
  });

  it("applies to the native engine only", () => {
    expect(allowed({ engine: "native", ownershipModel: "resolver" }, axes.constraints)).toBe(true);
    expect(allowed({ engine: "mock", ownershipModel: "resolver" }, axes.constraints)).toBe(false);
    expect(allowed({ engine: "mock", ownershipModel: "resolution" }, axes.constraints)).toBe(false);
  });

  it("known-failing entries may name its values, and only those", () => {
    const entry = (ownershipModel: string) => ({
      probe: "aliased-sibling-regex",
      when: { ownershipModel },
      failure: "^aliased-sibling-regex\\.test\\.ts: Cannot find module '@axis/rvalidator/store'",
      fixedBy: "#370",
      why: "a reason",
    });
    expect(validateEntries([entry("off")], axes, PROBES)).toEqual([]);
    expect(validateEntries([entry("resolution")], axes, PROBES)).toEqual([]);
    expect(validateEntries([entry("bridge")], axes, PROBES)).toEqual([
      'known-failing.json entry 0 (aliased-sibling-regex): ownershipModel has no value "bridge"',
    ]);
  });

  it("a build supports the flag only when it accepts the value and rejects a wrong one by name", () => {
    expect(
      judgeSupport({ accepted: null, rejected: 'bad "experimental.ownershipModel"', warnings: [] }),
    ).toEqual({ supported: true });
    // main before #370: an unknown option, warned about and ignored
    expect(
      judgeSupport({
        accepted: null,
        rejected: null,
        warnings: ["[vitest-native] Unknown option 'experimental'."],
      }),
    ).toMatchObject({ supported: false, reason: expect.stringContaining(UNSUPPORTED) });
    // a build that drops the flag: it accepts any value, so it does not read it
    expect(judgeSupport({ accepted: null, rejected: null, warnings: [] })).toMatchObject({
      supported: false,
      reason: expect.stringContaining("does not read it"),
    });
    // a build that throws for the value it is asked for is broken: the run fails
    expect(() => judgeSupport({ accepted: "no", rejected: "no", warnings: [] })).toThrow(
      /throws for the requested value: no/,
    );
  });

  it("a flag-on run that drops the flag fails aliased-sibling-regex instead of matching its entry", () => {
    // The regex-alias failure is known for the flag off only. A 'resolver' run whose
    // workspace never passed the flag on (the fixture ignoring AXIS_OWNERSHIP_MODEL)
    // shows the flag-off failure, and that must be a regression, not a known failure.
    const known = readKnownFailing();
    const native = { vitest: "5", rntl: "14", layout: "hoisted", engine: "native" };
    const failed = {
      status: "fail",
      failures: [
        "aliased-sibling-regex.test.ts: Cannot find module '@axis/rvalidator/store' imported from x",
      ],
    };
    const off = { ...native, ownershipModel: "off" };
    const on = { ...native, ownershipModel: "resolver" };
    expect(judge(known, "aliased-sibling-regex", off, failed)).toMatchObject({ ok: true });
    expect(judge(known, "aliased-sibling-regex", on, failed)).toMatchObject({ ok: false });
    expect(judge(known, "aliased-sibling-regex", on, { status: "pass" })).toMatchObject({
      ok: true,
    });
  });

  it("asks the build itself, and calls a build that ignores the flag unsupported", () => {
    const warns = fakeBuild(
      `if (options?.experimental) console.warn("[vitest-native] Unknown option 'experimental'.");`,
    );
    const ignores = fakeBuild("return {};");
    const throws = fakeBuild(`throw new Error("broken build");`);
    const unloadable = fakeBuild("");
    fs.writeFileSync(path.join(unloadable, "dist/index.mjs"), 'throw new Error("cannot load");\n');
    const reads = fakeBuild(
      `if (options?.experimental?.ownershipModel !== "resolver") throw new Error('"experimental.ownershipModel" must be "resolver".');`,
    );
    try {
      expect(ownershipSupport(warns, "resolver").supported).toBe(false);
      expect(ownershipSupport(ignores, "resolver").supported).toBe(false);
      expect(ownershipSupport(reads, "resolver")).toEqual({ supported: true });
      expect(ownershipSupport(warns, "off")).toEqual({ supported: true });
      // broken builds fail the run instead of reading as "without the flag"
      expect(() => ownershipSupport(throws, "resolver")).toThrow(/throws for the requested value/);
      expect(() => ownershipSupport(unloadable, "resolver")).toThrow(/could not load the build/);
    } finally {
      for (const dir of [warns, ignores, reads, throws, unloadable])
        fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the museum's wrapper gives every reactNative() call the flag, keeps the rest, and records the call", async () => {
    const installed = fakeBuild("return options;");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-ownership-root-"));
    try {
      wrapForOwnership(installed, root, "resolver");
      const manifest = JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8"));
      const entry = path.join(installed, manifest.exports["."].default);
      const wrapped = await import(pathToFileURL(entry).href);
      expect(wrapped.reactNative({ hotRuntime: false, experimental: { other: 1 } })).toEqual({
        hotRuntime: false,
        experimental: { other: 1, ownershipModel: "resolver" },
      });
      expect(wrapped.reactNative()).toEqual({ experimental: { ownershipModel: "resolver" } });
      expect(wrapped.other).toBe("kept");
      expect(fs.readFileSync(path.join(root, OWNERSHIP_MARKER), "utf8")).toBe(
        "resolver\nresolver\n",
      );
    } finally {
      for (const dir of [installed, root]) fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
