import { describe, expect, it } from "vitest";
import { compareHotRuns, failureKind, type HotRun } from "../src/cli/compare-hot.js";
import type { RunnerFile, RunnerResults } from "../src/cli/compare.js";

type T = {
  title: string;
  status?: "passed" | "failed" | "skipped";
  message?: string;
  ancestors?: string[];
};

function results(files: Record<string, T[] | { broken: string }>): RunnerResults {
  const map = new Map<string, RunnerFile>();
  for (const [file, spec] of Object.entries(files)) {
    if (!Array.isArray(spec)) {
      map.set(file, { file, status: "failed", message: spec.broken, broken: true, tests: [] });
      continue;
    }
    map.set(file, {
      file,
      status: spec.some((t) => t.status === "failed") ? "failed" : "passed",
      message: "",
      broken: false,
      tests: spec.map((t) => ({
        ancestors: t.ancestors ?? [],
        title: t.title,
        status: t.status ?? "passed",
        rawStatus: t.status ?? "passed",
        message: t.message ?? null,
      })),
    });
  }
  return { runner: "vitest", files: map };
}

const run = (
  mode: HotRun["mode"],
  files: Parameters<typeof results>[0],
  wallMs = 1000,
  extra: Partial<HotRun> = {},
): HotRun => ({
  mode,
  results: results(files),
  wallMs,
  ...extra,
});

const suite = { "a.test.ts": [{ title: "x" }, { title: "y" }] };

describe("compare --hot: the per-test verdict", () => {
  it("finds no difference in identical runs, and takes the speed-up without the warm-ups", () => {
    const v = compareHotRuns([
      run("per-file", suite, 9000),
      run("per-file", suite, 4000),
      run("per-file", suite, 6000),
      run("hot", suite, 5000),
      run("hot", suite, 2000),
      run("hot", suite, 2000),
    ]);
    expect(v.noDifference).toBe(true);
    expect(v.testsCompared).toBe(2);
    expect(v.medianMs).toEqual({ "per-file": 5000, hot: 2000 });
    expect(v.speedup).toBe(2.5);
  });

  it("reports a test that passes per file and fails hot", () => {
    const failing = {
      "a.test.ts": [
        { title: "x" },
        { title: "y", status: "failed" as const, message: "AssertionError: expected 1 to be 2" },
      ],
    };
    const v = compareHotRuns([
      run("per-file", suite),
      run("per-file", suite),
      run("hot", failing),
      run("hot", failing),
    ]);
    expect(v.noDifference).toBe(false);
    expect(v.differences).toEqual([
      expect.objectContaining({
        test: "a.test.ts › y",
        kind: "hot-only",
        perFile: "passed",
        hot: "failed:AssertionError",
      }),
    ]);
  });

  it("compares a failure's kind, not its message", () => {
    const fail = (message: string) => ({
      "a.test.ts": [{ title: "x", status: "failed" as const, message }],
    });
    const same = compareHotRuns([
      run("per-file", fail("AssertionError: expected 'a' (at /tmp/1) to be 'b'")),
      run("hot", fail("AssertionError: expected 'a' (at /tmp/2) to be 'b'")),
    ]);
    expect(same.noDifference).toBe(true);
    const changed = compareHotRuns([
      run("per-file", fail("AssertionError: expected 'a' to be 'b'")),
      run("hot", fail("Error: Test timed out in 5000ms.")),
    ]);
    expect(changed.differences[0]).toMatchObject({
      perFile: "failed:AssertionError",
      hot: "failed:timeout",
    });
  });

  it("names hot-runtime codes and a refusing worker as their own kinds", () => {
    expect(
      failureKind("VitestNativeError: [vitest-native] HOT_FILE_NOT_RUN: file was not run"),
    ).toBe("HOT_FILE_NOT_RUN");
    expect(failureKind("Error: this worker cannot run this file")).toBe("hot-worker-refused");
    expect(failureKind("TypeError: x is not a function")).toBe("TypeError");
    expect(failureKind("Error: ENOENT: no such file or directory")).toBe("ENOENT");
  });

  it("judges a per-file-flaky test by the subset rule", () => {
    const flaky = (status: "passed" | "failed" | "skipped") => ({
      "a.test.ts": [
        { title: "x", status, message: status === "failed" ? "AssertionError: no" : undefined },
      ],
    });
    const ok = compareHotRuns([
      run("per-file", flaky("passed")),
      run("per-file", flaky("failed")),
      run("hot", flaky("failed")),
      run("hot", flaky("failed")),
    ]);
    expect(ok.noDifference).toBe(true);
    expect(ok.judgedBySubset).toBe(1);
    expect(ok.perFileFlakes).toHaveLength(1);
    const skipped = compareHotRuns([
      run("per-file", flaky("passed")),
      run("per-file", flaky("failed")),
      run("hot", flaky("skipped")),
      run("hot", flaky("skipped")),
    ]);
    expect(skipped.differences[0]).toMatchObject({ kind: "outside-per-file", hot: "skipped" });
  });

  it("does not call a hot flake 'no difference'", () => {
    const fail = {
      "a.test.ts": [
        { title: "x" },
        { title: "y", status: "failed" as const, message: "AssertionError: no" },
      ],
    };
    const v = compareHotRuns([
      run("per-file", suite),
      run("per-file", suite),
      run("hot", suite),
      run("hot", fail),
    ]);
    expect(v.noDifference).toBe(false);
    expect(v.hotFlakes).toEqual([
      { test: "a.test.ts › y", mode: "hot", statuses: ["passed", "failed:AssertionError"] },
    ]);
  });

  it("tells same-named tests apart by occurrence, so a differing twin cannot hide", () => {
    const twins = (second: "passed" | "failed") => ({
      "a.test.ts": [
        { title: "row" },
        { title: "row", status: second, message: "AssertionError: no" },
      ],
    });
    const v = compareHotRuns([run("per-file", twins("passed")), run("hot", twins("failed"))]);
    expect(v.testsCompared).toBe(2);
    expect(v.differences.map((d) => d.test)).toEqual(["a.test.ts › row #2"]);
  });

  it("compares a shuffled hot run with the stable per-file result, and keeps its seed", () => {
    const fail = {
      "a.test.ts": [
        { title: "x", status: "failed" as const, message: "TypeError: carried over" },
        { title: "y" },
      ],
    };
    const v = compareHotRuns([
      run("per-file", suite),
      run("per-file", suite),
      run("hot", suite),
      run("hot", fail, 1000, { seed: 4242 }),
    ]);
    expect(v.differences).toEqual([
      expect.objectContaining({
        test: "a.test.ts › x",
        kind: "order",
        seed: 4242,
        hot: "failed:TypeError",
      }),
    ]);
  });

  it("counts a file that fails to load hot only, and errors outside tests", () => {
    const v = compareHotRuns([
      run("per-file", suite, 1000, { unhandledErrors: 0 }),
      run("hot", { "a.test.ts": { broken: "TypeError: cannot read 'x'" } }, 1000, {
        unhandledErrors: 1,
      }),
    ]);
    const kinds = v.differences.map((d) => d.kind).sort();
    expect(kinds).toEqual(["one-mode", "one-mode", "one-mode", "run-errors"]);
    expect(v.differences.find((d) => d.kind === "run-errors")).toMatchObject({
      perFile: "0",
      hot: "1",
    });
  });

  it("reports snapshot bookkeeping that differs by mode", () => {
    const v = compareHotRuns([
      run("per-file", suite, 1000, { snapshots: { written: 0, obsolete: 0 } }),
      run("hot", suite, 1000, { snapshots: { written: 0, obsolete: 2 } }),
    ]);
    expect(v.differences).toEqual([
      expect.objectContaining({ kind: "snapshots", perFile: "0/0", hot: "0/2" }),
    ]);
  });
});

describe("compare --hot: the plugin hook", () => {
  it("is on every reactNative() instance, under a registered symbol, and not enumerable", async () => {
    const { reactNative } = await import("../src/plugin.js");
    const plugin = reactNative() as unknown as Record<symbol, unknown>;
    const key = Symbol.for("vitest-native.compare-hot-runtime");
    expect(typeof plugin[key]).toBe("function");
    expect(Object.keys(plugin)).not.toContain(key.toString());
    expect(Object.getOwnPropertyDescriptor(plugin, key)?.enumerable).toBe(false);
    expect(() => (plugin[key] as (v: false | "auto") => void)("auto")).not.toThrow();
  });
});

describe("compare --hot: options, plan and banner", async () => {
  const { parseCompareArgs } = await import("../src/cli/compare-run.js");
  const { bannerProblem, plannedRuns } = await import("../src/cli/compare-hot-run.js");

  it("parses --hot with its own options and refuses Jest-only ones", () => {
    const ok = parseCompareArgs(["--hot", "--runs", "3", "--seed", "11", "--no-shuffle"]);
    expect(ok).toMatchObject({ hot: true, runs: 3, seed: 11, shuffle: false });
    expect(parseCompareArgs(["--hot", "--jest-args", "--silent"])).toEqual({
      error: expect.stringContaining("--jest-args do not apply"),
    });
    expect(parseCompareArgs(["--runs", "3"])).toEqual({
      error: expect.stringContaining("only with --hot"),
    });
    expect(parseCompareArgs(["--hot", "--runs", "0"])).toEqual({
      error: "--runs needs a positive whole number.",
    });
  });

  it("plans N per-file and N hot runs, a shuffled hot run, and an untimed one at two workers", () => {
    expect(
      plannedRuns({ runs: 2, shuffle: true, seed: 5 }).map((r) => [
        r.mode,
        r.label,
        r.untimed ?? false,
      ]),
    ).toEqual([
      ["per-file", "per-file 1", false],
      ["per-file", "per-file 2", false],
      ["hot", "hot 1", false],
      ["hot", "hot 2", false],
      ["hot", "hot shuffled (seed 5)", false],
      ["hot", "hot at --maxWorkers=2", true],
    ]);
  });

  it("checks each run's banner for the mode it claims", () => {
    const hot =
      "[vitest-native] engine: native — real react-native@0.86.3 · mocked: x (platform ios, hot runtime)\n";
    const perFile =
      "[vitest-native] engine: native — real react-native@0.86.3 · mocked: x (platform ios)\n";
    expect(bannerProblem("hot", hot)).toBeNull();
    expect(bannerProblem("per-file", perFile)).toBeNull();
    expect(bannerProblem("hot", perFile)).toContain("does not report the hot runtime");
    expect(bannerProblem("per-file", hot)).toContain("reports the hot runtime");
    expect(
      bannerProblem(
        "hot",
        `[vitest-native] hot runtime off: one worker; Vitest's settings apply.\n${perFile}`,
      ),
    ).toContain("declined: one worker");
    expect(bannerProblem("hot", "no banner")).toContain("no vitest-native engine banner");
  });
});

describe("compare --hot: review fixes", async () => {
  const { bannerProblem } = await import("../src/cli/compare-hot-run.js");
  const flaky = (status: "passed" | "failed" | "skipped") => ({
    "a.test.ts": [
      { title: "x", status, message: status === "failed" ? "AssertionError: no" : undefined },
    ],
  });

  it("treats a hot-only pass on retry as a difference", () => {
    const v = compareHotRuns([
      run("per-file", suite),
      run("hot", suite, 1000, { retried: new Set(["a.test.ts › y"]) }),
    ]);
    expect(v.differences).toEqual([
      expect.objectContaining({
        test: "a.test.ts › y",
        perFile: "passed",
        hot: "passed-after-retry",
      }),
    ]);
  });

  it("does not block on a per-file-flaky test whose hot results stay within its per-file set", () => {
    const v = compareHotRuns([
      run("per-file", flaky("passed")),
      run("per-file", flaky("failed")),
      run("hot", flaky("failed")),
      run("hot", flaky("passed")),
    ]);
    expect(v.hotFlakes).toEqual([]);
    expect(v.noDifference).toBe(true);
  });

  it("judges a per-file-flaky test in the shuffled run by the subset rule", () => {
    const v = compareHotRuns([
      run("per-file", flaky("passed")),
      run("per-file", flaky("failed")),
      run("hot", flaky("passed")),
      run("hot", flaky("skipped"), 1000, { seed: 3 }),
    ]);
    expect(v.differences).toEqual([
      expect.objectContaining({ kind: "order", hot: "skipped", seed: 3 }),
    ]);
  });

  it("records a file that failed after its tests ran", () => {
    const withHookFailure = (broken: boolean): HotRun => {
      const r = run("hot", suite);
      const file = r.results.files.get("a.test.ts")!;
      if (broken)
        Object.assign(file, { broken: true, status: "failed", message: "Error: afterAll failed" });
      return r;
    };
    const v = compareHotRuns([run("per-file", suite), withHookFailure(true)]);
    expect(v.differences.map((d) => d.test)).toEqual([
      "a.test.ts › (file failed outside any test)",
    ]);
  });

  it("gives no verdict when no test ran", () => {
    expect(compareHotRuns([run("per-file", {}), run("hot", {})]).noDifference).toBe(false);
  });

  it("reads Node error codes, not capitalised words, as a kind", () => {
    expect(failureKind("Error: ENOENT: no such file")).toBe("ENOENT");
    expect(failureKind("AssertionError: expected ENABLED to be DISABLED")).toBe("AssertionError");
  });

  it("reads a hot banner with notes after the runtime, and a config-time decline", () => {
    const suffixed =
      "[vitest-native] engine: native — real react-native@0.86.3 · mocked: x (platform ios, hot runtime, experimental.ownershipModel: resolution)\n";
    expect(bannerProblem("hot", suffixed)).toBeNull();
    expect(bannerProblem("per-file", suffixed)).toContain("reports the hot runtime");
    const withMocks =
      "[vitest-native] engine: native — real react-native@0.86.3 · mocked: x (platform ios, hot runtime, experimental.nodeMocks: x, y)\n";
    expect(bannerProblem("hot", withMocks)).toBeNull();
    expect(
      bannerProblem(
        "hot",
        `${suffixed}[vitest-native] hotRuntime:'auto' kept default isolation: user pool\n`,
      ),
    ).toContain("declined: user pool");
  });
});

describe("compare --hot: timing, by the evidence log's rules", async () => {
  const { renderHotVerdict } = await import("../src/cli/compare-hot-run.js");
  const { parseCompareArgs } = await import("../src/cli/compare-run.js");
  const { timingRoles } = await import("../src/cli/compare-hot.js");
  const walls = (pf: number[], hot: number[], extra: HotRun[] = []) => [
    ...pf.map((ms, i) => run("per-file", suite, ms, { label: `per-file ${i + 1}` })),
    ...hot.map((ms, i) => run("hot", suite, ms, { label: `hot ${i + 1}` })),
    ...extra,
  ];
  const shuffled = run("hot", suite, 9999, { seed: 3, label: "hot shuffled (seed 3)" });
  const workers = run("hot", suite, 9999, { untimed: true, label: "hot at --maxWorkers=2" });

  it("defaults to three runs per mode: one warm-up and two timed", () => {
    const parsed = parseCompareArgs(["--hot"]);
    expect("error" in parsed ? parsed.error : parsed.runs).toBe(3);
  });

  it("gives each run a role: the first of a mode warms up, shuffled and worker runs are checks", () => {
    expect(timingRoles(walls([9, 5, 6], [7, 2, 3], [shuffled, workers]))).toEqual([
      "warm-up",
      "timed",
      "timed",
      "warm-up",
      "timed",
      "timed",
      "check",
      "check",
    ]);
    // One run per mode is all there is: it is timed (and is too few for a verdict).
    expect(timingRoles(walls([5], [2]))).toEqual(["timed", "timed"]);
  });

  it("says faster only when two timed runs per mode do not overlap, with the spread", () => {
    const runs = walls([9000, 6000, 6400], [5000, 3000, 3200], [shuffled, workers]);
    const v = compareHotRuns(runs);
    expect(v.speed).toBe("faster");
    expect(v.rangeMs).toEqual({ "per-file": [6000, 6400], hot: [3000, 3200] });
    expect(v.speedup).toBeCloseTo(2.0, 5);
    const text = renderHotVerdict(v, runs).join("\n");
    expect(text).toContain("per-file 1                       9.0 s (warm-up, not timed)");
    expect(text).toContain("hot shuffled (seed 3)            10.0 s (order check, not timed)");
    expect(text).toContain("hot at --maxWorkers=2            10.0 s (worker check, not timed)");
    expect(text).toContain(
      "Timing, 2 timed runs per mode: per file 6.2 s median (6.0–6.4 s), hot 3.1 s median (3.0–3.2 s): hot is 2.0× faster.",
    );
  });

  it("makes no speed claim when the ranges overlap", () => {
    const v = compareHotRuns(walls([9000, 2500, 2700], [3000, 2600, 2800]));
    expect(v.speed).toBe("within-spread");
    expect(v.speedup).toBeNull();
    expect(renderHotVerdict(v, []).join("\n")).toContain(
      "the ranges overlap, so no speed difference can be claimed.",
    );
  });

  it("says slower when hot's fastest run is slower than per file's slowest", () => {
    const v = compareHotRuns(walls([9000, 2000, 2100], [3000, 3000, 3200]));
    expect(v.speed).toBe("slower");
    expect(renderHotVerdict(v, []).join("\n")).toContain("hot is 1.5× slower here");
  });

  it("with one timed run per mode, says so and gives no verdict", () => {
    // obytes with --runs 2: per file 2.5 s, hot 2.6 s, one timed run each.
    const v = compareHotRuns(walls([8944, 2467], [3436, 2603], [shuffled]));
    expect(v.speed).toBe("too-few-samples");
    expect(v.speedup).toBeNull();
    const text = renderHotVerdict(v, []).join("\n");
    expect(text).toContain(
      "Timing: one timed run per mode (per file 2.5 s, hot 2.6 s), too few to say whether hot is faster. Rerun with --runs 3 or more",
    );
    expect(text).not.toMatch(/× faster|slower here|nothing to gain/);
  });
});
