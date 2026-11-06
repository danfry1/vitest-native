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
