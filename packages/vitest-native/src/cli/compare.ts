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
  /**
   * How many times the runner reported this identity (Vitest or Jest projects, a
   * repeated title). It passed only if every copy passed.
   */
  copies?: number;
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

export type SnapshotHint = "no-vitest-snapshot" | "shared-snapshot-dir";

export interface Entry {
  bucket: Bucket;
  file: string;
  ancestors: string[];
  /** Jest's title (Vitest's, for a test only Vitest reported). */
  title: string;
  jest: Side | null;
  vitest: Side | null;
  /** Set when the titles differ and the tests were matched by position in their block. */
  vitestTitle?: string;
  /** Set on a regression that fails only because Vitest has no snapshot of its own. */
  hint?: SnapshotHint;
}

export interface FileSummary {
  file: string;
  status: Outcome;
  tests: number;
  message: string | null;
}

/** How the Vitest process ended, beyond what its JSON report says. */
export interface VitestRun {
  exitCode: number | null;
  /** First lines of unhandled errors and errors during close, sanitized. */
  errors: string[];
  /** The engine vitest-native reported, or null when no vitest-native plugin ran. */
  engine: string | null;
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
  vitest: VitestRun & {
    /** Why `vitest run` does not exit 0; empty when it does. */
    problems: string[];
  };
  /**
   * Every test that passes under Jest also passes under Vitest, there is at least one,
   * and `vitest run` exits 0.
   */
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
  /** Spellings of the project root, replaced with `<root>`. */
  roots: string[];
  /** The temporary directory's spellings, replaced with `<tmp>`. */
  tmp?: string[];
  home?: string;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every way a message can spell `p`: as written, with either separator, JSON-escaped
 * (`C:\\x`), as a file URL. A Windows drive letter matches in either case.
 */
function spellingPattern(paths: string[]): RegExp | null {
  const out = new Set<string>();
  for (const p of paths) {
    if (!p || p.length < 2) continue;
    const forward = p.replace(/\\/g, "/").replace(/\/$/, "");
    if (forward.length < 2) continue;
    out.add(forward);
    out.add(forward.replace(/\//g, "\\"));
    out.add(forward.replace(/\//g, "\\\\"));
    out.add(`file://${forward.startsWith("/") ? "" : "/"}${forward}`);
  }
  if (!out.size) return null;
  const alternatives = [...out]
    .sort((a, b) => b.length - a.length)
    .map((s) =>
      escapeRegex(s).replace(
        /^([A-Za-z]):/,
        (_, d: string) => `[${d.toLowerCase()}${d.toUpperCase()}]:`,
      ),
    );
  return new RegExp(alternatives.join("|"), "g");
}

/** A Node location line (`/x/y.js:2`) heading a source line and a `^^^` marker. */
const LOCATION = /^\s*\S+:\d+(?::\d+)?\s*$/;
const CARETS = /^\s*\^+\s*$/;
/** A code-frame line: an optional `>`/`❯` marker, a line number, a vertical bar. */
const FRAME = /^\s*[>❯]?\s*\d*\s*[|│┃┆┊]/;
/** Box drawing (oxc/Vite 8's frames: `╭─[`, `───╯`, `╰──`). */
const BOX = /^\s*[\u2500-\u257f]/;
/** Absolute paths left after the known roots are replaced. */
const POSIX_PATH = /(?<![\w.<>/~:@-])\/[\w.@+~-]+(?:\/[\w.@+~-]+)+\/?/g;
const WINDOWS_PATH = /(?<![\w])[A-Za-z]:(?:\\\\|\\|\/)[^\s'"`)\]},;]*/g;
const FILE_URL = /file:\/\/\/[^\s'"`)\]},;]*/g;

/**
 * A runner's failure message, kept to the error's own text. Removed: ANSI codes, the
 * stack (cut at the first `    at ` or `❯` frame), code frames of every runner (`> 12 |`,
 * `12| `, `12 │`, box drawing, `^` markers), Node's `file:line` + source + `^^^` blocks
 * (Jest's "Details:"), and absolute paths (the root becomes `<root>`, the temporary
 * directory `<tmp>`, the home directory `~`, any other `<path>`). What remains can still
 * include values a test put in its error, such as expected and received values.
 */
export function sanitizeMessage(raw: string, ctx: SanitizeContext): string {
  const lines = raw.replace(ANSI, "").replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s+at\s/.test(line) || /^\s*❯\s/.test(line)) break;
    if (FRAME.test(line) || BOX.test(line) || CARETS.test(line)) continue;
    if (LOCATION.test(line)) {
      const caret = lines.slice(i + 1, i + 5).findIndex((l) => CARETS.test(l));
      if (caret !== -1) {
        i += caret + 1;
        continue;
      }
    }
    kept.push(line);
  }
  let text = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const replace = (paths: string[], to: string) => {
    const pattern = spellingPattern(paths);
    if (pattern) text = text.replace(pattern, to);
  };
  replace(ctx.roots, "<root>");
  replace(ctx.tmp ?? [], "<tmp>");
  if (ctx.home) replace([ctx.home], "~");
  text = text
    .replace(FILE_URL, "<path>")
    .replace(WINDOWS_PATH, "<path>")
    .replace(POSIX_PATH, "<path>");
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
  /**
   * Other spellings of the root: where a report made elsewhere (in CI) was recorded.
   * Its files are read relative to these too.
   */
  aliases?: string[];
  /** Resolve a path's symlinks; identity when it does not exist. Overridable for tests. */
  realpath?: (p: string) => string;
  home?: string;
  tmp?: string[];
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

function rootSpellings(ctx: NormaliseContext): string[] {
  const real = ctx.realpath ?? defaultRealpath;
  return [...new Set([ctx.root, real(ctx.root), ...(ctx.aliases ?? [])])];
}

/** A reported test file as a root-relative `/` path (absolute when outside the root). */
export function relativeFile(name: string, ctx: NormaliseContext): string {
  const real = ctx.realpath ?? defaultRealpath;
  const file = slashed(real(name));
  const roots = rootSpellings(ctx).map((r) => slashed(r).replace(/\/$/, ""));
  for (const r of roots) {
    if (file.startsWith(`${r}/`)) return file.slice(r.length + 1);
  }
  const base = slashed(real(ctx.root)).replace(/\/$/, "");
  if (file.startsWith("/") && base.startsWith("/")) return path.posix.relative(base, file);
  return file;
}

/**
 * Where a report made at another root was recorded: the prefix that, removed from its
 * absolute file names, leaves the files the other runner reported here. Null when no
 * prefix accounts for at least half of its files.
 */
export function foreignRoot(json: unknown, localFiles: string[]): string | null {
  const names = ((json as { testResults?: Array<{ name?: unknown }> })?.testResults ?? [])
    .map((r) => (typeof r?.name === "string" ? slashed(r.name) : null))
    .filter((n): n is string => n !== null);
  const votes = new Map<string, number>();
  for (const name of names) {
    const match = localFiles.find((rel) => name.endsWith(`/${rel}`));
    if (match) {
      const prefix = name.slice(0, -(match.length + 1));
      votes.set(prefix, (votes.get(prefix) ?? 0) + 1);
    }
  }
  const [best] = [...votes].sort((a, b) => b[1] - a[1]);
  return best && best[1] * 2 >= names.length ? best[0] : null;
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
    roots: rootSpellings(ctx),
    tmp: ctx.tmp ?? tmpSpellings(),
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
    // Projects report the same file once each: one file, every copy of its tests.
    const existing = files.get(file);
    if (existing) {
      existing.tests.push(...tests);
      if (status === "failed") existing.status = "failed";
      existing.broken ||= broken;
      existing.message ||= message;
    } else {
      files.set(file, { file, status, message, broken, tests });
    }
  }
  return { runner, files };
}

/** The system temporary directory, as written and with symlinks resolved. */
export function tmpSpellings(): string[] {
  const tmp = os.tmpdir();
  return [...new Set([tmp, defaultRealpath(tmp)])];
}

// ---------------------------------------------------------------------------
// Classifying
// ---------------------------------------------------------------------------

interface Group {
  ancestors: string[];
  title: string;
  tests: RunnerTest[];
}

/** Tests grouped by identity, in the order each identity first appears. */
function grouped(tests: RunnerTest[]): Map<string, Group> {
  const out = new Map<string, Group>();
  for (const t of tests) {
    const key = JSON.stringify([t.ancestors, t.title]);
    const group = out.get(key) ?? { ancestors: t.ancestors, title: t.title, tests: [] };
    group.tests.push(t);
    out.set(key, group);
  }
  return out;
}

/**
 * One result for every copy of an identity: passed only if every copy passed, failed if
 * any failed, otherwise skipped. Pairing copies by order would match a passing copy with
 * a failing one when the runners order them differently (concurrent tests, Jest's
 * randomize, projects).
 */
function aggregate(group: Group): Side {
  const { tests } = group;
  const failed = tests.find((t) => t.status === "failed");
  const status: Outcome = failed
    ? "failed"
    : tests.every((t) => t.status === "passed")
      ? "passed"
      : "skipped";
  const side: Side = {
    status,
    rawStatus: tests.length === 1 ? tests[0].rawStatus : tests.map((t) => t.rawStatus).join(", "),
    message: failed?.message ?? null,
  };
  if (tests.length > 1) side.copies = tests.length;
  return side;
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

/**
 * Whether two titles can be the same test formatted differently: parametrised titles
 * (`it.each`) are formatted by each runner (`%s` of an object, `%p`, `$var`, `%%`,
 * tagged templates), so they share the text before the first parameter.
 */
export function sameTemplate(a: string, b: string): boolean {
  const [wa, wb] = [a.split(/\s/)[0], b.split(/\s/)[0]];
  let common = 0;
  while (common < a.length && a[common] === b[common]) common++;
  return wa === wb && common >= 3;
}

export interface ClassifyOptions {
  /** What a regression whose message is Vitest's snapshot mismatch should say, if anything. */
  snapshotHint?: (file: string, message: string) => SnapshotHint | undefined;
  /** How the Vitest process ended; derived from the report when absent. */
  vitestRun?: VitestRun;
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
      for (const g of grouped(present.tests).values()) {
        entries.push({
          bucket: jf ? "only-jest" : "only-vitest",
          file,
          ancestors: g.ancestors,
          title: g.title,
          jest: jf ? aggregate(g) : null,
          vitest: vf ? aggregate(g) : null,
        });
      }
      continue;
    }
    const jg = grouped(jf.tests);
    const vg = grouped(vf.tests);
    const unmatched = { jest: new Map<string, Group[]>(), vitest: new Map<string, Group[]>() };
    const pairs: Array<{ a: Group | undefined; b: Group | undefined; vitestTitle?: string }> = [];
    for (const key of new Set([...jg.keys(), ...vg.keys()])) {
      const a = jg.get(key);
      const b = vg.get(key);
      // A test reported by one runner only is first held back for positional matching.
      if (a && !b && !vf.broken) {
        const block = JSON.stringify(a.ancestors);
        unmatched.jest.set(block, [...(unmatched.jest.get(block) ?? []), a]);
      } else if (b && !a && !jf.broken) {
        const block = JSON.stringify(b.ancestors);
        unmatched.vitest.set(block, [...(unmatched.vitest.get(block) ?? []), b]);
      } else {
        pairs.push({ a, b });
      }
    }
    // Within a describe block, tests only one runner named are matched in order while
    // their titles share a template; the rest are reported by one runner only.
    for (const [block, js] of unmatched.jest) {
      const vs = unmatched.vitest.get(block) ?? [];
      let i = 0;
      while (i < js.length && i < vs.length && sameTemplate(js[i].title, vs[i].title)) {
        pairs.push({ a: js[i], b: vs[i], vitestTitle: vs[i].title });
        i++;
      }
      for (const a of js.slice(i)) pairs.push({ a, b: undefined });
      unmatched.vitest.set(block, vs.slice(i));
    }
    for (const vs of unmatched.vitest.values()) for (const b of vs) pairs.push({ a: undefined, b });

    for (const { a, b, vitestTitle } of pairs) {
      const ref = (a ?? b) as Group;
      let j: Side | null = a ? aggregate(a) : jf.broken ? notRunSide(jf, "jest") : null;
      let v: Side | null = b ? aggregate(b) : vf.broken ? notRunSide(vf, "vitest") : null;
      // A test skipped in a file that failed outside any test did not run because of
      // that failure (Vitest reports a failing beforeAll this way) — unless the other
      // runner skipped it too.
      if (j && v && j.status === "skipped" && v.status !== "skipped" && jf.broken)
        j = notRunSide(jf, "jest");
      if (j && v && v.status === "skipped" && j.status !== "skipped" && vf.broken)
        v = notRunSide(vf, "vitest");
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
      if (vitestTitle !== undefined && vitestTitle !== ref.title) entry.vitestTitle = vitestTitle;
      const message = v?.message ?? "";
      if (bucket === "regression" && options.snapshotHint && SNAPSHOT_MISMATCH.test(message)) {
        const hint = options.snapshotHint(file, message);
        if (hint) entry.hint = hint;
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
  const brokenVitest = broken(vitest);

  // `vitest run` must exit 0 too: a failing test with no passing Jest counterpart, an
  // unhandled error or a failed teardown each make it exit 1, and none of them is a
  // test Jest passed.
  const vitestFailing = entries.filter((e) => e.vitest?.status === "failed");
  const derivedExit = vitestFailing.length || brokenVitest.length ? 1 : 0;
  const run: VitestRun = options.vitestRun ?? { exitCode: derivedExit, errors: [], engine: null };
  const problems: string[] = [];
  if (run.exitCode !== 0) {
    if (vitestFailing.length) {
      const by = (bucket: Bucket) => vitestFailing.filter((e) => e.bucket === bucket).length;
      const parts = [
        [by("regression"), "pass under Jest"],
        [by("same-fail"), "fail under Jest too"],
        [by("only-vitest"), "Jest did not run"],
      ].filter(([n]) => (n as number) > 0);
      problems.push(
        `${vitestFailing.length} ${vitestFailing.length === 1 ? "test fails" : "tests fail"} under Vitest` +
          (parts.length ? ` (${parts.map(([n, what]) => `${n} ${what}`).join(", ")})` : ""),
      );
    }
    for (const f of brokenVitest.filter((b) => b.tests === 0 && !jest.files.get(b.file)?.broken)) {
      problems.push(`${f.file} fails to load under Vitest: ${firstLine(f.message)}`);
    }
    problems.push(...run.errors);
    if (!problems.length) {
      problems.push(
        `Vitest exited ${run.exitCode ?? "by a signal"} although its JSON report shows no failure ` +
          `(a globalSetup teardown, process.exit, or an error outside any test); run \`vitest run\` to see it`,
      );
    }
  }
  return {
    entries,
    counts,
    files: { onlyJest, onlyVitest, brokenJest: broken(jest), brokenVitest },
    totals: { jest: total(jest), vitest: total(vitest) },
    jestPassed,
    confirmed,
    vitest: { ...run, problems },
    claimHolds: jestPassed > 0 && confirmed === jestPassed && run.exitCode === 0,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export const SNAPSHOT_HINTS: Record<SnapshotHint, string> = {
  "no-vitest-snapshot":
    "no Vitest snapshot recorded. Give Vitest its own snapshot directory first (the " +
    "resolveSnapshotPath recipe in docs/migrating-from-jest.md, section 2d), so recording " +
    "cannot rewrite Jest's .snap files; then run `vitest run` once and review the new files",
  "shared-snapshot-dir":
    "your Vitest config resolves snapshots to Jest's .snap files, which Vitest cannot read " +
    "(other keys) and rewrites. Give Vitest its own directory with the resolveSnapshotPath " +
    "recipe in docs/migrating-from-jest.md, section 2d, before recording",
};

export interface Cluster {
  message: string;
  count: number;
  tests: Array<{ file: string; ancestors: string[]; title: string }>;
}

/** Entries grouped by the first line of the given side's message, largest group first. */
export function clusters(entries: Entry[], by: Runner): Cluster[] {
  const groups = new Map<string, Cluster>();
  for (const e of entries) {
    const key = e.hint ? SNAPSHOT_HINTS[e.hint] : firstLine(e[by]?.message ?? null);
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
  return `${plural(t.files, "file")}, ${plural(t.tests, "test")} (${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped)`;
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

export function engineLabel(engine: string | null): string {
  return engine ? `engine: ${engine}` : "no vitest-native engine reported";
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
  const engine = engineLabel(c.vitest.engine);
  if (c.jestPassed === 0) {
    lines.push("✗ No test passed under Jest, so there is nothing to compare against.");
  } else if (c.confirmed === c.jestPassed) {
    lines.push(
      `${c.claimHolds ? "✓" : "✗"} All ${plural(c.jestPassed, "test")} that pass under Jest also pass under ` +
        `Vitest (${engine})${c.claimHolds ? ", and `vitest run` exits 0." : ", but:"}`,
    );
  } else {
    lines.push(
      `✗ ${c.jestPassed - c.confirmed} of the ${plural(c.jestPassed, "test")} that pass under Jest do not pass ` +
        `under Vitest (${engine}): ${gap.failed.length} fail, ${gap.skipped.length} skipped, ` +
        `${gap.missing.length} not collected.`,
    );
  }
  if (!c.vitest.engine) {
    lines.push(
      "! Vitest reported no vitest-native engine: is reactNative() in this Vitest config?",
    );
  }
  if (c.vitest.problems.length) {
    lines.push(`✗ \`vitest run\` exits ${c.vitest.exitCode ?? "by a signal"}:`);
    for (const p of c.vitest.problems.slice(0, top)) lines.push(`    ${p}`);
    if (c.vitest.problems.length > top)
      lines.push(`    … and ${c.vitest.problems.length - top} more (see --json)`);
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
  const testList = (title: string, list: Entry[], describe: (e: Entry) => string = testName) => {
    if (!list.length) return;
    lines.push(`${title} (${list.length}):`);
    for (const e of list.slice(0, top)) lines.push(`  ${describe(e)}`);
    if (list.length > top) lines.push(`  … and ${list.length - top} more (see --json)`);
    lines.push("");
  };
  testList(
    "Skipped under Vitest, passed under Jest",
    c.entries.filter((e) => e.bucket === "skip-difference" && e.jest?.status === "passed"),
  );
  testList(
    "Matched by position: the runners format these titles differently (Jest ⇄ Vitest)",
    c.entries.filter((e) => e.vitestTitle !== undefined),
    (e) => `${testName(e)}  ⇄  ${e.vitestTitle}`,
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
  const copies = c.entries.filter(
    (e) => (e.jest?.copies ?? 1) !== (e.vitest?.copies ?? 1) && e.jest && e.vitest,
  );
  testList(
    "Reported a different number of times (projects or repeated titles; each passes only if every copy passed)",
    copies,
    (e) => `${testName(e)}  (Jest ${e.jest?.copies ?? 1}×, Vitest ${e.vitest?.copies ?? 1}×)`,
  );

  lines.push(
    options.jsonPath
      ? `Report: ${options.jsonPath} — test names, statuses and error messages, with stack traces, code ` +
          `frames and absolute paths removed. Read it before attaching it to an issue: a message can still ` +
          `contain whatever a test put in its error.`
      : "Write a report to attach to an issue with --json <file>.",
  );
  return lines;
}

export interface JsonMeta {
  vitestNative: string | null;
  jest: RunnerInfo;
  vitest: RunnerInfo;
}

/** The `--json` report: identities, statuses and messages. */
export function jsonReport(c: Comparison, meta: JsonMeta): Record<string, unknown> {
  const listed = c.entries.filter(
    (e) => (e.bucket !== "same-pass" && e.bucket !== "same-skip") || e.vitestTitle !== undefined,
  );
  return {
    format: "vitest-native-compare@1",
    about:
      "One run of a suite under Jest and one under Vitest: test identities (file relative to the " +
      "project root, describe titles, title), statuses and error messages. Stack traces, code frames " +
      "and absolute paths (<root>, <tmp>, ~, <path>) are removed from messages; a message can still " +
      "contain whatever a test put in its error. Tests with the same result under both runners are " +
      "counted, not listed, except failures.",
    tool: { vitestNative: meta.vitestNative, node: process.version, platform: process.platform },
    runners: { jest: meta.jest, vitest: meta.vitest },
    verdict: {
      claim: "every test that passes under Jest also passes under Vitest, and `vitest run` exits 0",
      holds: c.claimHolds,
      jestPassed: c.jestPassed,
      confirmed: c.confirmed,
      vitestExitCode: c.vitest.exitCode,
      vitestProblems: c.vitest.problems,
      engine: c.vitest.engine,
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
      ...(e.vitestTitle !== undefined ? { vitestTitle: e.vitestTitle } : {}),
      jest: e.jest,
      vitest: e.vitest,
      ...(e.hint ? { hint: e.hint } : {}),
    })),
  };
}
