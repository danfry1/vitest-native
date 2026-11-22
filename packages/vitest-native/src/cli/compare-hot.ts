/**
 * `vitest-native compare --hot`: the verdict on whether `hotRuntime: 'auto'` changes any
 * test's result in this suite, from repeated per-file and hot runs of the same config.
 *
 * Tests are identified by file, full name and occurrence among tests sharing that name
 * (`it.each` twins), so a differing duplicate cannot hide behind its twin. A file that failed
 * outside any test (to load, or in a hook) counts as one pseudo-test. The rules
 * (documented in website/guide/cli.md#compare-hot) are:
 * - a test's outcome is its status plus, for a failure, its KIND (timeout, an error code
 *   such as a hot-runtime code, or the error name), not the message text;
 * - hot-only difference: stable within each mode, different between them;
 * - one-mode: present in one mode's runs only;
 * - hot flake: differs between hot runs;
 * - per-file flake: differs between per-file runs; a suite problem, reported apart, and still
 *   judged: every hot outcome must be one per-file also produced;
 * - order: a shuffled hot run differs from the stable per-file result;
 * - run-level: hot runs with more unhandled errors, or different snapshot written/obsolete
 *   counts, than per-file.
 * "No difference" means none of these with at least one run per mode; the caller words it as
 * "no difference in N per-file and M hot runs", never "safe".
 */
import { testName, type RunnerResults } from "./compare.js";

export type HotMode = "per-file" | "hot";

export interface HotRun {
  mode: HotMode;
  results: RunnerResults;
  wallMs: number;
  /** Set for a hot run with shuffled file order. */
  seed?: number;
  /** Errors Vitest reported outside any test (unhandled errors, errors between tests). */
  unhandledErrors?: number;
  /** Snapshot bookkeeping, which differs by mode only if a test did not run the same. */
  snapshots?: { written: number; obsolete: number };
  /** Compared, but left out of the speed-up (a run at another worker count). */
  untimed?: boolean;
  /** Tests that passed only after a retry, as `file › describe › title` (compare's reporter). */
  retried?: ReadonlySet<string>;
  /** A label for reports: "per-file 1", "hot 2", "hot shuffled", "hot maxWorkers=2". */
  label?: string;
}

/**
 * passed | failed:<kind> | skipped | todo | load-failed:<kind> | absent, with
 * "passed-after-retry" for a test the reporter says needed a retry.
 */
export type TestStatus = string;

export interface HotDifference {
  test: string;
  kind: "hot-only" | "one-mode" | "order" | "outside-per-file" | "run-errors" | "snapshots";
  perFile: TestStatus;
  hot: TestStatus;
  /** The first line of the failure on the side that failed, if any. */
  message: string | null;
  seed?: number;
}

export interface HotFlake {
  test: string;
  mode: HotMode;
  statuses: TestStatus[];
}

export interface HotVerdict {
  /** No difference of any kind, with at least one run in each mode. */
  noDifference: boolean;
  testsCompared: number;
  /** Per-file-flaky tests, judged only by the subset rule. */
  judgedBySubset: number;
  differences: HotDifference[];
  hotFlakes: HotFlake[];
  perFileFlakes: HotFlake[];
  wallsMs: Record<HotMode, number[]>;
  /** Each run's part in the timing, in the order the runs were given (TimingRole). */
  roles: TimingRole[];
  /** The timed runs' walls per mode: warm-ups and checks left out. */
  timedMs: Record<HotMode, number[]>;
  medianMs: Record<HotMode, number | null>;
  /** Fastest and slowest timed run per mode; null without one. */
  rangeMs: Record<HotMode, [number, number] | null>;
  /**
   * What the timing supports. faster/slower only from at least MIN_TIMED_SAMPLES timed runs
   * per mode whose ranges do not overlap; within-spread when they overlap; too-few-samples
   * otherwise (no claim either way).
   */
  speed: "faster" | "slower" | "within-spread" | "too-few-samples";
  /** Per-file median over hot median, when `speed` makes a claim; null otherwise. */
  speedup: number | null;
}

/**
 * A run's part in the timing. warm-up: the first run of a mode when there are more, which
 * fills caches. check: a run at another order or worker count, compared but not timed.
 */
export type TimingRole = "warm-up" | "timed" | "check";

/** Timed runs per mode below which no faster/slower claim is made (the evidence log's rule). */
export const MIN_TIMED_SAMPLES = 2;

/** Each run's timing role: checks are shuffled or untimed runs; the first of a mode warms up. */
export function timingRoles(runs: readonly HotRun[]): TimingRole[] {
  const plain = (r: HotRun) => r.seed === undefined && !r.untimed;
  const count = (m: HotMode) => runs.filter((r) => r.mode === m && plain(r)).length;
  const seen = new Set<HotMode>();
  return runs.map((r) => {
    if (!plain(r)) return "check";
    const first = !seen.has(r.mode);
    seen.add(r.mode);
    return first && count(r.mode) > 1 ? "warm-up" : "timed";
  });
}

interface Observed {
  status: TestStatus;
  message: string | null;
}

/**
 * The kind of a failure: a timeout, a code it names (hot-runtime and other vitest-native
 * codes, Node error codes), a hot worker refusing the file, or the error's name.
 */
export function failureKind(message: string | null | undefined): string {
  if (!message) return "unknown";
  if (/\btimed out in \d+\s*ms\b|\bTest timed out\b/i.test(message)) return "timeout";
  if (/this worker cannot run this file/i.test(message)) return "hot-worker-refused";
  const code = /\b((?:HOT|SOURCE|NATIVE|OWNERSHIP|ERR)_[A-Z0-9_]+)\b|\b(E[A-Z]{3,}):/.exec(message);
  if (code) return code[1] ?? code[2];
  const name = /^\s*(?:[A-Za-z]+:\s*)?([A-Z][A-Za-z]*(?:Error|Exception))\b/.exec(message);
  return name ? name[1] : "Error";
}

/** Every test of one run, keyed by file › name (#occurrence for a repeated name). */
export function testsOfRun(
  results: RunnerResults,
  retried: ReadonlySet<string> = new Set(),
): Map<string, Observed> {
  const out = new Map<string, Observed>();
  for (const file of results.files.values()) {
    // A file that failed outside any test: to load, or in a hook after its tests ran.
    if (file.broken) {
      out.set(`${file.file} › (file failed outside any test)`, {
        status: `${file.tests.length === 0 ? "load-failed" : "file-failed"}:${failureKind(file.message)}`,
        message: firstLineOf(file.message),
      });
      if (file.tests.length === 0) continue;
    }
    const seen = new Map<string, number>();
    for (const t of file.tests) {
      const base = testName({ file: file.file, ancestors: t.ancestors, title: t.title });
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const status: TestStatus =
        t.rawStatus === "todo"
          ? "todo"
          : t.status === "skipped"
            ? "skipped"
            : t.status === "failed"
              ? `failed:${failureKind(t.message)}`
              : retried.has(base)
                ? "passed-after-retry"
                : "passed";
      out.set(n === 1 ? base : `${base} #${n}`, { status, message: firstLineOf(t.message) });
    }
  }
  return out;
}

function firstLineOf(message: string | null | undefined): string | null {
  if (!message) return null;
  const line = message.split("\n").find((l) => l.trim() !== "");
  return line ? line.trim().slice(0, 200) : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The statuses of `key` in each run, "absent" where a run has no such test. */
function statusesOf(runs: Map<string, Observed>[], key: string): TestStatus[] {
  return runs.map((r) => r.get(key)?.status ?? "absent");
}

export function compareHotRuns(runs: readonly HotRun[]): HotVerdict {
  const ordered = runs.filter((r) => r.seed === undefined);
  const shuffled = runs.filter((r) => r.seed !== undefined);
  const byMode: Record<HotMode, Map<string, Observed>[]> = { "per-file": [], hot: [] };
  for (const r of ordered) byMode[r.mode].push(testsOfRun(r.results, r.retried));

  const keys = new Set<string>();
  for (const mode of ["per-file", "hot"] as const)
    for (const run of byMode[mode]) for (const k of run.keys()) keys.add(k);

  const differences: HotDifference[] = [];
  let judgedBySubset = 0;
  const hotFlakes: HotFlake[] = [];
  const perFileFlakes: HotFlake[] = [];
  const stablePerFile = new Map<string, TestStatus>();
  for (const key of [...keys].sort()) {
    const pf = statusesOf(byMode["per-file"], key);
    const hot = statusesOf(byMode.hot, key);
    const pfStable = new Set(pf).size === 1;
    const hotStable = new Set(hot).size === 1;
    if (!pfStable) perFileFlakes.push({ test: key, mode: "per-file", statuses: pf });
    // A test flaky per file is judged by the subset rule only; hot varying within the
    // per-file set is not a hot flake.
    if (!hotStable && pfStable) hotFlakes.push({ test: key, mode: "hot", statuses: hot });
    if (!pfStable) {
      // Judged by the subset rule: hot may only produce outcomes per file also produced.
      judgedBySubset++;
      const allowed = new Set(pf);
      const outside = hot.filter((h) => !allowed.has(h));
      if (outside.length > 0) {
        differences.push({
          test: key,
          kind: "outside-per-file",
          perFile: [...allowed].join(" | "),
          hot: [...new Set(outside)].join(" | "),
          message:
            byMode.hot.find((r) => outside.includes(r.get(key)?.status ?? "absent"))?.get(key)
              ?.message ?? null,
        });
      }
      continue;
    }
    stablePerFile.set(key, pf[0]);
    if (!hotStable || pf[0] === hot[0]) continue;
    const failing = (r: Map<string, Observed>) => r.get(key)?.status.startsWith("failed") ?? false;
    const message =
      byMode.hot.find(failing)?.get(key)?.message ??
      byMode["per-file"].find(failing)?.get(key)?.message ??
      null;
    differences.push({
      test: key,
      kind: pf[0] === "absent" || hot[0] === "absent" ? "one-mode" : "hot-only",
      perFile: pf[0],
      hot: hot[0],
      message,
    });
  }

  const listed = new Set(differences.map((d) => d.test));
  for (const run of shuffled) {
    const tests = testsOfRun(run.results, run.retried);
    const all = new Set([...stablePerFile.keys(), ...tests.keys(), ...keys]);
    for (const key of [...all].sort()) {
      if (listed.has(key)) continue;
      const got = tests.get(key)?.status ?? "absent";
      if (!stablePerFile.has(key) && keys.has(key)) {
        // Flaky per file: the shuffled result must be one the per-file runs produced.
        const allowed = new Set(statusesOf(byMode["per-file"], key));
        if (!allowed.has(got)) {
          differences.push({
            test: key,
            kind: "order",
            perFile: [...allowed].join(" | "),
            hot: got,
            message: tests.get(key)?.message ?? null,
            seed: run.seed,
          });
        }
        continue;
      }
      const expected = stablePerFile.get(key) ?? "absent";
      if (expected !== got) {
        differences.push({
          test: key,
          kind: "order",
          perFile: expected,
          hot: got,
          message: tests.get(key)?.message ?? null,
          seed: run.seed,
        });
      }
    }
  }

  // Run-level evidence: errors outside tests, and snapshot bookkeeping.
  const ofMode = (mode: HotMode) => ordered.filter((r) => r.mode === mode);
  const errs = (mode: HotMode) => ofMode(mode).map((r) => r.unhandledErrors ?? 0);
  const maxPerFileErrors = Math.max(0, ...errs("per-file"));
  const hotErrors = Math.max(0, ...errs("hot"), ...shuffled.map((r) => r.unhandledErrors ?? 0));
  if (hotErrors > maxPerFileErrors) {
    differences.push({
      test: "(errors outside any test)",
      kind: "run-errors",
      perFile: String(maxPerFileErrors),
      hot: String(hotErrors),
      message: null,
    });
  }
  const snap = (mode: HotMode) =>
    new Set(
      ofMode(mode)
        .filter((r) => r.snapshots)
        .map((r) => `${r.snapshots!.written}/${r.snapshots!.obsolete}`),
    );
  const pfSnap = snap("per-file");
  const hotSnap = snap("hot");
  if (pfSnap.size === 1 && hotSnap.size >= 1 && [...hotSnap].some((s) => !pfSnap.has(s))) {
    differences.push({
      test: "(snapshots written/obsolete)",
      kind: "snapshots",
      perFile: [...pfSnap].join(" | "),
      hot: [...hotSnap].join(" | "),
      message: null,
    });
  }

  const wallsMs: Record<HotMode, number[]> = {
    "per-file": ordered.filter((r) => r.mode === "per-file" && !r.untimed).map((r) => r.wallMs),
    hot: ordered.filter((r) => r.mode === "hot" && !r.untimed).map((r) => r.wallMs),
  };
  const roles = timingRoles(runs);
  const timedOf = (m: HotMode) =>
    runs.filter((r, i) => r.mode === m && roles[i] === "timed").map((r) => r.wallMs);
  const timedMs: Record<HotMode, number[]> = {
    "per-file": timedOf("per-file"),
    hot: timedOf("hot"),
  };
  const rangeOf = (w: number[]): [number, number] | null =>
    w.length ? [Math.min(...w), Math.max(...w)] : null;
  const medianMs: Record<HotMode, number | null> = {
    "per-file": median(timedMs["per-file"]),
    hot: median(timedMs.hot),
  };
  const rangeMs: Record<HotMode, [number, number] | null> = {
    "per-file": rangeOf(timedMs["per-file"]),
    hot: rangeOf(timedMs.hot),
  };
  const pf = rangeMs["per-file"];
  const hr = rangeMs.hot;
  const speed: HotVerdict["speed"] =
    !pf || !hr || Math.min(timedMs["per-file"].length, timedMs.hot.length) < MIN_TIMED_SAMPLES
      ? "too-few-samples"
      : hr[1] < pf[0]
        ? "faster"
        : hr[0] > pf[1]
          ? "slower"
          : "within-spread";
  const speedup =
    (speed === "faster" || speed === "slower") && medianMs["per-file"] !== null && medianMs.hot
      ? medianMs["per-file"] / medianMs.hot
      : null;

  return {
    noDifference:
      byMode["per-file"].length > 0 &&
      byMode.hot.length > 0 &&
      keys.size > 0 &&
      differences.length === 0 &&
      hotFlakes.length === 0,
    testsCompared: keys.size,
    judgedBySubset,
    differences,
    hotFlakes,
    perFileFlakes,
    wallsMs,
    roles,
    timedMs,
    medianMs,
    rangeMs,
    speed,
    speedup,
  };
}
