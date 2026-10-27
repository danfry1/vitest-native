/**
 * `vitest-native compare`: the pure half. It reads a Jest `--json` report and a Vitest
 * JSON-reporter report, matches their tests, sorts each into a bucket and renders the
 * result. Running the two runners is compare-run.ts. The design, and why the summary
 * makes the one claim it does, is in docs/compare-mode.md.
 *
 * Formats: Jest's `FormattedTestResults` (@jest/test-result 30: testResults[].name,
 * .status, .message, .assertionResults[] with ancestorTitles/title/status/
 * failureMessages) and Vitest's `JsonTestResults` (vitest 4–5, the same field names).
 * Identities come from the structured fields, never from `fullName`: both runners join
 * it with spaces, so `describe("a b")` and `describe("a", () => describe("b"))` collide.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type Runner = "jest" | "vitest";
export type Outcome = "passed" | "failed" | "skipped";

export interface RunnerTest {
  ancestors: string[];
  title: string;
  status: Outcome;
  /** The runner's own word (`pending`, `todo`, `disabled`, …). */
  rawStatus: string;
  /** The first failure message, sanitized, or null. */
  message: string | null;
}

export interface RunnerFile {
  file: string;
  status: Outcome;
  /** A file-level message (Jest: the formatted failure; Vitest: the first file error), sanitized. */
  message: string;
  /** Failed outside any test: failed to load, or a hook failed. */
  broken: boolean;
  tests: RunnerTest[];
}

export interface RunnerResults {
  runner: Runner;
  files: Map<string, RunnerFile>;
}

export interface Side {
  status: Outcome;
  rawStatus: string;
  message: string | null;
  /** Set when the test has no result of its own because its file failed. */
  notRun?: "file-failed";
}

export type Bucket =
  | "same-pass"
  | "same-fail"
  | "same-skip"
  | "regression"
  | "improvement"
  | "skip-difference"
  | "only-jest"
  | "only-vitest";

export interface Entry {
  bucket: Bucket;
  file: string;
  ancestors: string[];
  title: string;
  jest: Side | null;
  vitest: Side | null;
  /** Set on a regression that fails only because Vitest has no snapshot recorded. */
  hint?: "no-vitest-snapshot";
}

export interface FileSummary {
  file: string;
  status: Outcome;
  tests: number;
  message: string | null;
}

export interface Comparison {
  entries: Entry[];
  counts: Record<Bucket, number>;
  files: {
    onlyJest: FileSummary[];
    onlyVitest: FileSummary[];
    /** Files that failed outside any test under each runner. */
    brokenJest: FileSummary[];
    brokenVitest: FileSummary[];
  };
  totals: Record<Runner, { files: number; tests: number } & Record<Outcome, number>>;
  /** Tests that passed under Jest. */
  jestPassed: number;
  /** Of those, the ones that also passed under Vitest. */
  confirmed: number;
  /** Every test that passes under Jest also passes under Vitest, and there is at least one. */
  claimHolds: boolean;
}

export const BUCKETS: readonly Bucket[] = [
  "same-pass",
  "same-fail",
  "same-skip",
  "regression",
  "improvement",
  "skip-difference",
  "only-jest",
  "only-vitest",
];

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

// oxlint-disable-next-line no-control-regex -- ANSI escape sequences are control characters.
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export interface SanitizeContext {
  /** Spellings of the project root to replace with `<root>`. */
  roots: string[];
  home?: string;
}

/** Both separator spellings and the file URL of each path, longest first. */
function spellings(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    if (!p) continue;
    const forward = p.replace(/\\/g, "/").replace(/\/$/, "");
    out.add(p.replace(/[\\/]$/, ""));
    out.add(forward);
    out.add(forward.replace(/\//g, "\\"));
    out.add(`file://${forward.startsWith("/") ? "" : "/"}${forward}`);
  }
  return [...out].filter((s) => s.length > 1).sort((a, b) => b.length - a.length);
}

/**
 * A runner's failure message without anything that is not a message: ANSI codes, the
 * stack (cut at the first `    at ` frame), code frames (`> 12 | …` and the `^`
 * marker) and absolute paths (the root becomes `<root>`, the home directory `~`).
 * Jest's file-level message carries code frames; a test's failureMessages carry the
 * stack; Vitest's carry the stack. What remains is the error's own text, which can
 * include values the test printed (expected/received).
 */
export function sanitizeMessage(raw: string, ctx: SanitizeContext): string {
  const lines = raw.replace(ANSI, "").replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s+at\s/.test(line)) break;
    if (/^\s*>?\s*\d+\s*\|/.test(line) || /^\s*\|\s*\^/.test(line)) continue;
    kept.push(line);
  }
  let text = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  for (const s of spellings(ctx.roots)) text = text.split(s).join("<root>");
  if (ctx.home) for (const s of spellings([ctx.home])) text = text.split(s).join("~");
  const capped = text.split("\n").slice(0, 30).join("\n");
  return capped.length > 4000 ? `${capped.slice(0, 4000)}…` : capped;
}

/**
 * The first non-empty line, whitespace collapsed: the key errors are grouped by. Jest's
 * `● <test name>` / `● Test suite failed to run` headers are skipped, so its file
 * failures group by the error.
 */
export function firstLine(message: string | null): string {
  const lines = (message ?? "").split("\n").filter((l) => l.trim() !== "");
  const line = lines.find((l) => !l.trim().startsWith("●")) ?? lines[0] ?? "";
  const collapsed = line.trim().replace(/\s+/g, " ");
  return collapsed.length > 160 ? `${collapsed.slice(0, 160)}…` : collapsed || "(no message)";
}

// ---------------------------------------------------------------------------
// Normalising
// ---------------------------------------------------------------------------

export interface NormaliseContext {
  /** The project root as given (absolute). */
  root: string;
  /** Resolve a path's symlinks; identity when it does not exist. Overridable for tests. */
  realpath?: (p: string) => string;
  home?: string;
}

function defaultRealpath(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return p;
  }
}

/** `/` separators and a lowercase drive letter: Jest writes `D:\x`, Vitest `D:/x`. */
function slashed(p: string): string {
  return p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d: string) => `${d.toLowerCase()}:`);
}

/** A reported test file as a root-relative `/` path (absolute when outside the root). */
export function relativeFile(name: string, ctx: NormaliseContext): string {
  const real = ctx.realpath ?? defaultRealpath;
  const file = slashed(real(name));
  const roots = [...new Set([ctx.root, real(ctx.root)].map((r) => slashed(r).replace(/\/$/, "")))];
  for (const r of roots) {
    if (file.startsWith(`${r}/`)) return file.slice(r.length + 1);
  }
  const base = roots[roots.length - 1];
  if (file.startsWith("/") && base.startsWith("/")) return path.posix.relative(base, file);
  return file;
}

function outcome(status: unknown): Outcome {
  return status === "passed" ? "passed" : status === "failed" ? "failed" : "skipped";
}

/**
 * One runner's report as files of tests. Throws when the JSON is not a Jest or Vitest
 * report, so a wrong file is an error and not an empty run.
 */
export function normaliseReport(
  json: unknown,
  runner: Runner,
  ctx: NormaliseContext,
): RunnerResults {
  const report = json as { testResults?: unknown };
  if (!report || typeof report !== "object" || !Array.isArray(report.testResults)) {
    throw new Error(`not a ${runner} JSON report: it has no testResults array`);
  }
  const sanitize: SanitizeContext = {
    roots: [ctx.root, (ctx.realpath ?? defaultRealpath)(ctx.root)],
    home: ctx.home ?? os.homedir(),
  };
  const files = new Map<string, RunnerFile>();
  for (const raw of report.testResults as Array<Record<string, unknown>>) {
    if (typeof raw?.name !== "string") continue;
    const file = relativeFile(raw.name, ctx);
    const assertions = Array.isArray(raw.assertionResults)
      ? (raw.assertionResults as Array<Record<string, unknown>>)
      : [];
    const tests: RunnerTest[] = assertions.map((a) => {
      const messages = Array.isArray(a.failureMessages) ? (a.failureMessages as unknown[]) : [];
      const first = messages.find((m) => typeof m === "string" && m.trim() !== "") as
        | string
        | undefined;
      return {
        ancestors: Array.isArray(a.ancestorTitles) ? a.ancestorTitles.map(String) : [],
        title: String(a.title ?? ""),
        status: outcome(a.status),
        rawStatus: String(a.status ?? ""),
        message: first ? sanitizeMessage(first, sanitize) : null,
      };
    });
    const status = outcome(raw.status);
    const message = typeof raw.message === "string" ? sanitizeMessage(raw.message, sanitize) : "";
    // Jest's file message also carries ordinary test failures, so for Jest only a file
    // with no failed test counts; Vitest's is the file's own first error.
    const broken =
      status === "failed" &&
      (tests.length === 0 ||
        !tests.some((t) => t.status === "failed") ||
        (runner === "vitest" && message !== ""));
    const existing = files.get(file);
    if (existing) existing.tests.push(...tests);
    else files.set(file, { file, status, message, broken, tests });
  }
  return { runner, files };
}

// ---------------------------------------------------------------------------
// Classifying
// ---------------------------------------------------------------------------

function testKey(t: { ancestors: string[]; title: string }): string {
  return JSON.stringify([t.ancestors, t.title]);
}

/** Tests keyed by identity; a repeated title in the same block is told apart by order. */
function keyed(tests: RunnerTest[]): Map<string, RunnerTest> {
  const seen = new Map<string, number>();
  const out = new Map<string, RunnerTest>();
  for (const t of tests) {
    const base = testKey(t);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.set(`${base}#${n}`, t);
  }
  return out;
}

const BROKEN_WITHOUT_MESSAGE: Record<Runner, string> = {
  jest: "the file failed outside any test under Jest",
  vitest:
    "failed outside any test (a beforeAll hook, for example); Vitest's JSON report has no " +
    "message for it, so run the file with `vitest run <file>` to see the error",
};

function fileFailure(file: RunnerFile, runner: Runner): string {
  return file.message || BROKEN_WITHOUT_MESSAGE[runner];
}

function side(test: RunnerTest): Side {
  return { status: test.status, rawStatus: test.rawStatus, message: test.message };
}

function notRunSide(file: RunnerFile, runner: Runner): Side {
  return {
    status: "failed",
    rawStatus: "not run",
    message: fileFailure(file, runner),
    notRun: "file-failed",
  };
}

function bucketOf(j: Outcome, v: Outcome): Bucket {
  if (j === v) return j === "passed" ? "same-pass" : j === "failed" ? "same-fail" : "same-skip";
  if (j === "skipped" || v === "skipped") return "skip-difference";
  return j === "passed" ? "regression" : "improvement";
}

function summary(file: RunnerFile, runner: Runner): FileSummary {
  return {
    file: file.file,
    status: file.status,
    tests: file.tests.length,
    message: file.broken ? fileFailure(file, runner) : null,
  };
}

export interface ClassifyOptions {
  /**
   * Whether Vitest has a snapshot file recorded for a test file. When it returns false,
   * a regression whose message is Vitest's snapshot mismatch is marked as such.
   */
  vitestSnapshotRecorded?: (file: string) => boolean;
}

const SNAPSHOT_MISMATCH = /Snapshot `[^`]*` mismatched/;

export function classify(
  jest: RunnerResults,
  vitest: RunnerResults,
  options: ClassifyOptions = {},
): Comparison {
  const entries: Entry[] = [];
  const onlyJest: FileSummary[] = [];
  const onlyVitest: FileSummary[] = [];
  const allFiles = [...new Set([...jest.files.keys(), ...vitest.files.keys()])].sort();

  for (const file of allFiles) {
    const jf = jest.files.get(file);
    const vf = vitest.files.get(file);
    if (!jf || !vf) {
      const present = (jf ?? vf) as RunnerFile;
      const runner: Runner = jf ? "jest" : "vitest";
      (jf ? onlyJest : onlyVitest).push(summary(present, runner));
      for (const t of present.tests) {
        entries.push({
          bucket: jf ? "only-jest" : "only-vitest",
          file,
          ancestors: t.ancestors,
          title: t.title,
          jest: jf ? side(t) : null,
          vitest: vf ? side(t) : null,
        });
      }
      continue;
    }
    const jt = keyed(jf.tests);
    const vt = keyed(vf.tests);
    for (const key of new Set([...jt.keys(), ...vt.keys()])) {
      const a = jt.get(key);
      const b = vt.get(key);
      const ref = (a ?? b) as RunnerTest;
      let j: Side | null = a ? side(a) : jf.broken ? notRunSide(jf, "jest") : null;
      let v: Side | null = b ? side(b) : vf.broken ? notRunSide(vf, "vitest") : null;
      // A test skipped in a file that failed outside any test did not run because of
      // that failure (Vitest reports a failing beforeAll this way) — unless the other
      // runner skipped it too.
      if (j && v && j.status === "skipped" && v.status !== "skipped" && jf.broken) {
        j = notRunSide(jf, "jest");
      }
      if (j && v && v.status === "skipped" && j.status !== "skipped" && vf.broken) {
        v = notRunSide(vf, "vitest");
      }
      const bucket: Bucket =
        j && v ? bucketOf(j.status, v.status) : j ? "only-jest" : "only-vitest";
      const entry: Entry = {
        bucket,
        file,
        ancestors: ref.ancestors,
        title: ref.title,
        jest: j,
        vitest: v,
      };
      if (
        bucket === "regression" &&
        options.vitestSnapshotRecorded &&
        SNAPSHOT_MISMATCH.test(v?.message ?? "") &&
        !options.vitestSnapshotRecorded(file)
      ) {
        entry.hint = "no-vitest-snapshot";
      }
      entries.push(entry);
    }
  }

  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  for (const e of entries) counts[e.bucket]++;
  const total = (r: RunnerResults) => {
    const t = { files: r.files.size, tests: 0, passed: 0, failed: 0, skipped: 0 };
    for (const f of r.files.values()) {
      for (const test of f.tests) {
        t.tests++;
        t[test.status]++;
      }
    }
    return t;
  };
  const jestPassed = entries.filter((e) => e.jest?.status === "passed").length;
  const confirmed = entries.filter(
    (e) => e.jest?.status === "passed" && e.vitest?.status === "passed",
  ).length;
  const broken = (r: RunnerResults) =>
    [...r.files.values()].filter((f) => f.broken).map((f) => summary(f, r.runner));
  return {
    entries,
    counts,
    files: { onlyJest, onlyVitest, brokenJest: broken(jest), brokenVitest: broken(vitest) },
    totals: { jest: total(jest), vitest: total(vitest) },
    jestPassed,
    confirmed,
    claimHolds: jestPassed > 0 && confirmed === jestPassed,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export const NO_SNAPSHOT_LABEL =
  "no Vitest snapshot recorded (compare never writes snapshots; record them with `vitest run`, review, then compare again)";

export interface Cluster {
  message: string;
  count: number;
  tests: Array<{ file: string; ancestors: string[]; title: string }>;
}

/** Entries grouped by the first line of the given side's message, largest group first. */
export function clusters(entries: Entry[], by: Runner): Cluster[] {
  const groups = new Map<string, Cluster>();
  for (const e of entries) {
    const key =
      e.hint === "no-vitest-snapshot" ? NO_SNAPSHOT_LABEL : firstLine(e[by]?.message ?? null);
    const group = groups.get(key) ?? { message: key, count: 0, tests: [] };
    group.count++;
    group.tests.push({ file: e.file, ancestors: e.ancestors, title: e.title });
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.message.localeCompare(b.message),
  );
}

export function testName(t: { file: string; ancestors: string[]; title: string }): string {
  return [t.file, ...t.ancestors, t.title].join(" › ");
}

export interface RunnerInfo {
  version: string | null;
  /** Where its config came from, for the header. */
  config: string;
}

export interface RenderOptions {
  jest: RunnerInfo;
  vitest: RunnerInfo;
  top: number;
  jsonPath?: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function totalsLine(t: Comparison["totals"]["jest"]): string {
  return (
    `${plural(t.files, "file")}, ${plural(t.tests, "test")} ` +
    `(${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped)`
  );
}

/** Jest-passing tests that did not pass under Vitest, by why. */
export function unconfirmed(c: Comparison): Record<"failed" | "skipped" | "missing", Entry[]> {
  const out = { failed: [] as Entry[], skipped: [] as Entry[], missing: [] as Entry[] };
  for (const e of c.entries) {
    if (e.jest?.status !== "passed" || e.vitest?.status === "passed") continue;
    if (!e.vitest) out.missing.push(e);
    else if (e.vitest.status === "failed") out.failed.push(e);
    else out.skipped.push(e);
  }
  return out;
}

export function renderComparison(c: Comparison, options: RenderOptions): string[] {
  const lines: string[] = [];
  const top = Math.max(1, options.top);
  const label = (r: RunnerInfo, name: string) =>
    `${name} ${r.version ?? "(version unknown)"}`.padEnd(15);
  lines.push(
    `Jest    ${label(options.jest, "jest")} ${totalsLine(c.totals.jest)} — config: ${options.jest.config}`,
    `Vitest  ${label(options.vitest, "vitest")} ${totalsLine(c.totals.vitest)} — config: ${options.vitest.config}`,
    "",
  );

  const gap = unconfirmed(c);
  if (c.jestPassed === 0) {
    lines.push("✗ No test passed under Jest, so there is nothing to compare against.");
  } else if (c.claimHolds) {
    lines.push(
      `✓ All ${plural(c.jestPassed, "test")} that pass under Jest also pass under Vitest.`,
    );
  } else {
    const missing = c.jestPassed - c.confirmed;
    lines.push(
      `✗ ${missing} of the ${plural(c.jestPassed, "test")} that pass under Jest do not pass under Vitest ` +
        `(${gap.failed.length} fail, ${gap.skipped.length} skipped, ${gap.missing.length} not collected).`,
    );
  }
  lines.push("");

  const n = c.counts;
  const row = (mark: string, name: string, count: number, note: string) =>
    lines.push(`  ${mark} ${name.padEnd(22)} ${String(count).padStart(5)}  ${note}`);
  row(
    " ",
    "same result",
    n["same-pass"] + n["same-fail"] + n["same-skip"],
    `${n["same-pass"]} pass, ${n["same-fail"]} fail, ${n["same-skip"]} skipped in both`,
  );
  row(
    n.regression ? "✗" : " ",
    "regressions",
    n.regression,
    "pass under Jest, fail under Vitest — fix these first",
  );
  row(" ", "improvements", n.improvement, "fail under Jest, pass under Vitest");
  row(
    n["skip-difference"] ? "~" : " ",
    "skipped differently",
    n["skip-difference"],
    "skipped by one runner, run by the other",
  );
  row(
    n["only-jest"] ? "!" : " ",
    "only under Jest",
    n["only-jest"],
    "no Vitest result: its file or the test was not collected",
  );
  row(n["only-vitest"] ? "!" : " ", "only under Vitest", n["only-vitest"], "no Jest result");
  lines.push("");

  // Collection differences are printed whatever the verdict: equal counts can hide them.
  const fileList = (title: string, files: FileSummary[]) => {
    if (!files.length) return;
    lines.push(`${title} (${files.length}):`);
    for (const f of files.slice(0, top)) {
      const why = f.message ? ` — ${firstLine(f.message)}` : "";
      lines.push(`  ${f.file} (${plural(f.tests, "test")}, ${f.status})${why}`);
    }
    if (files.length > top) lines.push(`  … and ${files.length - top} more (see --json)`);
    lines.push("");
  };
  fileList("! Test files only Jest collected", c.files.onlyJest);
  fileList("! Test files only Vitest collected", c.files.onlyVitest);
  fileList("✗ Test files that failed outside any test under Vitest", c.files.brokenVitest);

  const regressions = c.entries.filter((e) => e.bucket === "regression");
  if (regressions.length) {
    const groups = clusters(regressions, "vitest");
    lines.push(
      `Regressions by first Vitest error (top ${Math.min(top, groups.length)} of ${groups.length}):`,
    );
    for (const g of groups.slice(0, top)) {
      lines.push(`  ${g.count}× ${g.message}`);
      for (const t of g.tests.slice(0, 3)) lines.push(`       ${testName(t)}`);
      if (g.tests.length > 3) lines.push(`       … and ${g.tests.length - 3} more`);
    }
    lines.push("");
  }
  const testList = (title: string, list: Entry[]) => {
    if (!list.length) return;
    lines.push(`${title} (${list.length}):`);
    for (const e of list.slice(0, top)) lines.push(`  ${testName(e)}`);
    if (list.length > top) lines.push(`  … and ${list.length - top} more (see --json)`);
    lines.push("");
  };
  testList(
    "Skipped under Vitest, passed under Jest",
    c.entries.filter((e) => e.bucket === "skip-difference" && e.jest?.status === "passed"),
  );
  const collected = new Set([...c.files.onlyJest, ...c.files.onlyVitest].map((f) => f.file));
  testList(
    "Tests only Jest reported, in files both ran",
    c.entries.filter((e) => e.bucket === "only-jest" && !collected.has(e.file)),
  );
  testList(
    "Tests only Vitest reported, in files both ran",
    c.entries.filter((e) => e.bucket === "only-vitest" && !collected.has(e.file)),
  );

  if (options.jsonPath) {
    lines.push(
      `Report: ${options.jsonPath} — test names, statuses and error messages; no source code. ` +
        `Read it before attaching it to an issue: messages can include values your tests printed.`,
    );
  } else {
    lines.push("Write a report to attach to an issue with --json <file>.");
  }
  return lines;
}

export interface JsonMeta {
  vitestNative: string | null;
  jest: RunnerInfo;
  vitest: RunnerInfo;
}

/** The `--json` report: identities, statuses and messages; no source code. */
export function jsonReport(c: Comparison, meta: JsonMeta): Record<string, unknown> {
  const listed = c.entries.filter((e) => e.bucket !== "same-pass" && e.bucket !== "same-skip");
  return {
    format: "vitest-native-compare@1",
    about:
      "One run of a suite under Jest and one under Vitest. Contains test identities (file relative " +
      "to the project root, describe titles, title), statuses and error messages. No source code: " +
      "messages are cut at the first stack frame, code frames are removed, and paths are relative " +
      "to <root> or ~. Tests with the same result under both runners are counted, not listed, " +
      "except failures.",
    tool: {
      vitestNative: meta.vitestNative,
      node: process.version,
      platform: process.platform,
    },
    runners: { jest: meta.jest, vitest: meta.vitest },
    verdict: {
      claim: "every test that passes under Jest also passes under Vitest",
      holds: c.claimHolds,
      jestPassed: c.jestPassed,
      confirmed: c.confirmed,
    },
    totals: c.totals,
    counts: c.counts,
    files: c.files,
    clusters: {
      regression: clusters(
        listed.filter((e) => e.bucket === "regression"),
        "vitest",
      ),
    },
    tests: listed.map((e) => ({
      bucket: e.bucket,
      file: e.file,
      ancestors: e.ancestors,
      title: e.title,
      jest: e.jest,
      vitest: e.vitest,
      ...(e.hint ? { hint: e.hint } : {}),
    })),
  };
}
