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

export type SnapshotHint =
  | "no-vitest-snapshot"
  | "shared-snapshot-dir"
  | "shared-snapshot-dir-nested";

export interface Entry {
  bucket: Bucket;
  file: string;
  ancestors: string[];
  /** Jest's title (Vitest's, for a test only Vitest reported). */
  title: string;
  jest: Side | null;
  vitest: Side | null;
  /**
   * Set when the runners format the title differently (titleMatch) and the tests were
   * matched by position in their block.
   */
  vitestTitle?: string;
  /** Set when the titles match only in shape (titleMatch): listed for review, never confirmed. */
  matchedBy?: "shape";
  /**
   * On a test only Jest reported: the unmatched Vitest test at its place in the block,
   * which may be it named differently. Unconfirmed either way.
   */
  vitestCandidate?: string;
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
    /**
     * Errors Vitest printed although it exited 0 (`dangerouslyIgnoreUnhandledErrors`):
     * reported, not counted against the claim.
     */
    ignoredErrors: string[];
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
/** A marker line under a source excerpt: Node's `^^^`, TypeScript's `~~~`. */
const MARKER = /^\s*[\^~]+\s*$/;
/** A code-frame line: an optional `>`/`❯` marker, a line number, a vertical bar. */
const FRAME = /^\s*[>❯]?\s*\d*\s*[|│┃┆┊]/;
/** Box drawing (oxc/Vite 8's frames: `╭─[`, `───╯`, `╰──`). */
const BOX = /^\s*[─-╿]/;
/** A React component stack line: `in SecretVault (at vault.js:3)`, `in App`. */
const COMPONENT_STACK = /^\s+in [A-Z$_][\w$.]*(?: \(at [^)]*\)| \(created by [^)]*\))?\s*$/;

/**
 * Directories that only ever hold a machine's files — macOS's, a drive, a UNC share, and
 * the checkouts CI and containers use (GitHub Actions `/github/workspace`, `/__w`,
 * `/runner`; GitLab `/builds`; Buildkite; Netlify `/opt/build`; Docker's `/app`,
 * `/workspace`; WSL's `/mnt`): a path under one is a path, whatever it is followed by,
 * spaces included (`/Volumes/Client Work/app.js`).
 */
const MACHINE_ROOT = String.raw`(?:\/(?:Users|Volumes|private|var\/folders|builds|github\/workspace|app|runner|__w|workspace|opt\/build|buildkite|mnt)\/|[A-Za-z]:[\\/]|\\\\(?=[\w.$-]+\\))`;
/** A machine-rooted path, up to a file name with an extension, else to the next space. */
const MACHINE_PATH = new RegExp(
  String.raw`(?<![\w.<>/~:@-])${MACHINE_ROOT}(?:[^\n'"\`<>|]*?\.[A-Za-z0-9]{1,10}(?=[\s'"\`)\]},;:]|$)|[^\s'"\`)\]},;]*)`,
  "g",
);
/** Other absolute-looking spans; replaced only when they are paths (see isPath). */
const POSIX_CANDIDATE = /(?<![\w.<>/~:@-])\/[\w.@+~-]+(?:\/[\w.@+~-]*)+/g;
/** Roots shared with app routes (`/home/profile/edit`): a path needs a dotted segment there. */
const SHARED_ROOT = /^\/(?:home\/[^/]+|tmp|var|opt|root|srv|etc|usr)\//;
/** A home directory with at least two segments below the user: `/home/alice/clients/x`. */
const DEEP_HOME = /^\/home\/[^/]+\/[^/]+\/[^/]+/;
const FILE_URL = /file:\/\/\/[^\s'"`)\]},;]*/g;

/**
 * Whether an absolute-looking span is a path on a machine, not an app route: it exists
 * on disk, it goes two or more segments below a `/home/<user>/`, or it sits under a root
 * that routes share (`/home/<user>/`, `/tmp/`, …) and names a file (`.npmrc`, `app.js`).
 * `/home/profile/edit` and `/settings/privacy` stay.
 */
function isPath(span: string): boolean {
  try {
    if (fs.existsSync(span)) return true;
  } catch {
    // unreadable: decide by shape
  }
  if (DEEP_HOME.test(span)) return true;
  return SHARED_ROOT.test(span) && span.split("/").some((segment) => /\./.test(segment));
}

/**
 * A runner's failure message, kept to the error's own text. Removed: ANSI codes, the
 * stack (cut at the first `    at ` or `❯` frame), React component stacks, code frames of
 * every runner (`> 12 |`, `12| `, `12 │`, box drawing), any line a `^^^`/`~~~` marker
 * points at with its marker (Node's and esbuild's source excerpts, TypeScript
 * diagnostics), Node's `file:line` + source + `^^^` blocks (Jest's "Details:"), and
 * absolute paths: the root becomes `<root>`, the temporary directory `<tmp>`, the home
 * directory `~`, any other path on a machine `<path>` (UNC, Windows, file URLs, paths
 * with spaces). App routes such as `/home/profile/edit` are kept. What remains can still
 * include values a test put in its error, such as expected and received values.
 */
export function sanitizeMessage(raw: string, ctx: SanitizeContext): string {
  const lines = raw.replace(ANSI, "").replace(/\r\n?/g, "\n").split("\n");
  const end = lines.findIndex((l) => /^\s+at\s/.test(l) || /^\s*❯\s/.test(l));
  const body = end === -1 ? lines : lines.slice(0, end);
  const drop = new Set<number>();
  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    if (FRAME.test(line) || BOX.test(line) || COMPONENT_STACK.test(line)) drop.add(i);
    else if (MARKER.test(line)) {
      drop.add(i);
      // The source line the marker points at: the nearest line above that is not blank.
      for (let j = i - 1; j >= 0; j--) {
        if (body[j].trim() === "") continue;
        drop.add(j);
        // A Node location line (`/x/y.js:2`) heading that source line goes with it.
        if (j > 0 && LOCATION.test(body[j - 1])) drop.add(j - 1);
        break;
      }
    }
  }
  let text = body
    .filter((_, i) => !drop.has(i))
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
    .replace(MACHINE_PATH, "<path>")
    .replace(POSIX_CANDIDATE, (span) => (isPath(span) ? "<path>" : span));
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

/**
 * A Jest pass that Vitest confirms: Vitest passed it, at least as many times as Jest ran
 * it. Fewer copies means a Jest project (a platform, say) did not run under Vitest.
 */
export function isConfirmed(e: Entry): boolean {
  return (
    e.matchedBy !== "shape" &&
    e.jest?.status === "passed" &&
    e.vitest?.status === "passed" &&
    (e.vitest.copies ?? 1) >= (e.jest.copies ?? 1)
  );
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

/** A title as words and balanced `{…}` / `[…]` groups (printed values), in order. */
function titleTokens(title: string): string[] {
  const tokens: string[] = [];
  let word = "";
  const flush = () => {
    if (word) tokens.push(word);
    word = "";
  };
  for (let i = 0; i < title.length; i++) {
    const c = title[i];
    if (c === "{" || c === "[") {
      flush();
      let depth = 0;
      let j = i;
      for (; j < title.length; j++) {
        if (title[j] === "{" || title[j] === "[") depth++;
        else if (title[j] === "}" || title[j] === "]") depth--;
        if (depth === 0) break;
      }
      tokens.push(title.slice(i, j + 1));
      i = j;
    } else if (/\s/.test(c)) {
      flush();
    } else {
      word += c;
    }
  }
  flush();
  return tokens;
}

const isGroup = (t: string) => t.startsWith("{") || t.startsWith("[");
/** A printed value without what the two printers do differently: spaces, quotes, trailing commas. */
const canonicalValue = (t: string) =>
  t
    .replace(/\s+/g, "")
    .replace(/["']/g, "")
    .replace(/,([}\]])/g, "$1");

/**
 * Whether Jest's printed value and Vitest's are the same value. Jest (pretty-format and
 * util.format at depth 1) prints `{"a": 1}` and `{ a: 1, b: [Array] }`; Vitest prints
 * `{ a: 1 }` and `{ a: 1, b: [ 1, 2 ] }`. Jest's `[Array]` / `[Object]` stand for any
 * array or object at that place.
 */
function sameValue(jest: string, vitest: string): boolean {
  const pattern = canonicalValue(jest)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\[Array\\\]/g, "\\[.*?\\]")
    .replace(/\\\[Object\\\]/g, "\\{.*?\\}");
  return new RegExp(`^${pattern}$`).test(canonicalValue(vitest));
}

/**
 * A title with only what cannot change its meaning normalised: quote style (`'` and `"`
 * become one, quotes are kept), runs of whitespace, spaces inside brackets and around
 * `,` and `:`, and trailing commas.
 */
function normalTitle(t: string): string {
  return t
    .replace(/'/g, '"')
    .replace(/\s+/g, " ")
    .replace(/\s*([{}[\],:])\s*/g, "$1")
    .replace(/,([}\]])/g, "$1")
    .trim();
}

/**
 * Whether two titles have the same shape: equal except where the runners are known to
 * print a parametrised title (`it.each`) differently, each of which can hide a different
 * value: a printed object or array (quotes and Jest's `[Array]` / `[Object]` ignored),
 * Vitest's literal `%p` for one value, Jest's `$var` against Vitest's `undefined`, and
 * the `undefined` Vitest appends after `%%`.
 */
function sameShape(jest: string, vitest: string): boolean {
  const j = titleTokens(jest);
  const v = titleTokens(vitest);
  let i = 0;
  for (; i < j.length; i++) {
    const a = j[i];
    const b = v[i];
    if (b === undefined) return false;
    if (a === b) continue;
    if (isGroup(a) && isGroup(b) && sameValue(a, b)) continue;
    if (b === "%p") continue;
    if (/^\$[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/.test(a) && b === "undefined") continue;
    return false;
  }
  const rest = v.slice(i);
  return rest.length === 0 || (jest.includes("%") && rest.every((t) => t === "undefined"));
}

export type TitleMatch = "same" | "shape";

/**
 * How a Jest title matches a Vitest title, or null.
 *
 * - `same`: identical once quote style, whitespace and trailing commas are normalised
 *   (normalTitle). The same test; it confirms a Jest pass.
 * - `shape`: equal only once a printed value is ignored (sameShape). Possibly the same
 *   test printed differently, possibly a different row (`allows { user: [Object] }` is
 *   Jest's print of any user). Listed for review, and never confirms a Jest pass.
 */
export function titleMatch(jest: string, vitest: string): TitleMatch | null {
  if (normalTitle(jest) === normalTitle(vitest)) return "same";
  return sameShape(jest, vitest) ? "shape" : null;
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
    const pairs: Array<{
      a: Group | undefined;
      b: Group | undefined;
      vitestTitle?: string;
      matchedBy?: TitleMatch;
      vitestCandidate?: string;
    }> = [];
    for (const key of new Set([...jg.keys(), ...vg.keys()])) {
      const a = jg.get(key);
      const b = vg.get(key);
      // A test reported by one runner only is first held back for positional matching.
      if (a && !b && !vf.broken) {
        const block = JSON.stringify(a.ancestors);
        unmatched.jest.set(block, [...(unmatched.jest.get(block) ?? []), a]);
      } else if (b && !a && !jf.broken) {
        const block = JSON.stringify(b.ancestors);
        // Vitest leaves `%p` unformatted, so every row of a `%p` table is one title there:
        // one copy per row, each matched to Jest's row at its place.
        const rows =
          b.title.includes("%p") && b.tests.length > 1
            ? b.tests.map((t) => ({ ancestors: b.ancestors, title: b.title, tests: [t] }))
            : [b];
        unmatched.vitest.set(block, [...(unmatched.vitest.get(block) ?? []), ...rows]);
      } else {
        pairs.push({ a, b });
      }
    }
    // Within a describe block, tests only one runner named are matched by position when
    // their titles match (titleMatch): the same title, or the same shape, which is
    // listed for review and does not confirm. The rest stay unmatched; a Jest test with a
    // Vitest test at its place is "named differently".
    for (const [block, js] of unmatched.jest) {
      const vs = unmatched.vitest.get(block) ?? [];
      const left: Group[] = [];
      js.forEach((a, i) => {
        const b = vs[i];
        const match = b ? titleMatch(a.title, b.title) : null;
        if (b && match) {
          pairs.push({ a, b, vitestTitle: b.title, matchedBy: match });
          vs[i] = undefined as unknown as Group;
        } else {
          pairs.push({ a, b: undefined, vitestCandidate: b?.title });
        }
      });
      for (const b of vs) if (b) left.push(b);
      unmatched.vitest.set(block, left);
    }
    for (const vs of unmatched.vitest.values()) for (const b of vs) pairs.push({ a: undefined, b });

    for (const { a, b, vitestTitle, matchedBy, vitestCandidate } of pairs) {
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
      if (matchedBy === "shape") entry.matchedBy = "shape";
      if (vitestCandidate !== undefined && !v) entry.vitestCandidate = vitestCandidate;
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
  const confirmed = entries.filter(isConfirmed).length;
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
    vitest: { ...run, problems, ignoredErrors: run.exitCode === 0 ? run.errors : [] },
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
    "your Vitest config resolves snapshots to Jest's .snap files. This snapshot's key is the " +
    "same in both runners, but Vitest rewrites the header of a Jest .snap file it reads, so " +
    "compare does not let it read Jest's. Give Vitest its own directory (the resolveSnapshotPath " +
    "recipe in docs/migrating-from-jest.md, section 2d) and record there",
  "shared-snapshot-dir-nested":
    "your Vitest config resolves snapshots to Jest's .snap files. Vitest names this snapshot " +
    "differently (`a > b 1`, where Jest writes `a b 1`), so it would not find Jest's entry, and " +
    "it rewrites the header of a Jest .snap file it reads. Give Vitest its own directory (the " +
    "resolveSnapshotPath recipe in docs/migrating-from-jest.md, section 2d) and record there",
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
  /** Set when the runs changed files in the project: no ✓, whatever the tests did. */
  projectChanged?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function totalsLine(t: Comparison["totals"]["jest"]): string {
  return `${plural(t.files, "file")}, ${plural(t.tests, "test")} (${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped)`;
}

/** Jest-passing tests that did not pass under Vitest, by why. */
export type Unconfirmed = "failed" | "skipped" | "fewer" | "shape" | "renamed" | "missing";

/** Jest-passing tests that Vitest does not confirm (isConfirmed), by why. */
export function unconfirmed(c: Comparison): Record<Unconfirmed, Entry[]> {
  const out: Record<Unconfirmed, Entry[]> = {
    failed: [],
    skipped: [],
    fewer: [],
    shape: [],
    renamed: [],
    missing: [],
  };
  for (const e of c.entries) {
    if (e.jest?.status !== "passed" || isConfirmed(e)) continue;
    if (!e.vitest) out[e.vitestCandidate !== undefined ? "renamed" : "missing"].push(e);
    else if (e.vitest.status === "failed") out.failed.push(e);
    else if (e.vitest.status === "skipped") out.skipped.push(e);
    else if (e.matchedBy === "shape") out.shape.push(e);
    else out.fewer.push(e);
  }
  return out;
}

const UNCONFIRMED_LABELS: Record<Unconfirmed, string> = {
  failed: "fail",
  skipped: "skipped",
  fewer: "run fewer times (a Jest project missing)",
  shape: "matched only by title shape",
  renamed: "named differently",
  missing: "not collected",
};

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
  } else if (c.claimHolds && options.projectChanged) {
    lines.push(
      `✗ All ${plural(c.jestPassed, "test")} that pass under Jest also pass under Vitest (${engine}), ` +
        "but the runs changed files in the project (listed below), so the comparison does not count.",
    );
  } else if (c.claimHolds) {
    lines.push(
      `✓ All ${plural(c.jestPassed, "test")} that pass under Jest also pass under Vitest (${engine}), ` +
        "and `vitest run` exits 0.",
    );
  } else if (c.confirmed === c.jestPassed) {
    // Lead with what failed: the tests agree, the run does not.
    lines.push(
      `✗ \`vitest run\` exits ${c.vitest.exitCode ?? "by a signal"} (${engine}), although all ` +
        `${plural(c.jestPassed, "test")} that pass under Jest also pass under Vitest:`,
    );
  } else {
    const why = (Object.keys(UNCONFIRMED_LABELS) as Unconfirmed[])
      .filter((k) => gap[k].length > 0)
      .map((k) => `${gap[k].length} ${UNCONFIRMED_LABELS[k]}`);
    lines.push(
      `✗ ${c.jestPassed - c.confirmed} of the ${plural(c.jestPassed, "test")} that pass under Jest do not pass ` +
        `under Vitest (${engine}): ${why.join(", ")}.`,
    );
    if (gap.shape.length) {
      lines.push(
        `✗ ${plural(gap.shape.length, "test")} could only be matched by title shape; check them ` +
          `(Jest prints values differently, so a different row can look the same).`,
      );
    }
  }
  if (!c.vitest.engine) {
    lines.push(
      "! Vitest reported no vitest-native engine: is reactNative() in this Vitest config?",
    );
  }
  if (c.vitest.problems.length) {
    if (c.confirmed !== c.jestPassed || c.jestPassed === 0) {
      lines.push(`✗ \`vitest run\` exits ${c.vitest.exitCode ?? "by a signal"}:`);
    }
    for (const p of c.vitest.problems.slice(0, top)) lines.push(`    ${p}`);
    if (c.vitest.problems.length > top)
      lines.push(`    … and ${c.vitest.problems.length - top} more (see --json)`);
  }
  if (c.vitest.ignoredErrors.length) {
    lines.push("! Vitest printed these errors but exited 0 (its config ignores unhandled errors):");
    for (const e of c.vitest.ignoredErrors.slice(0, top)) lines.push(`    ${e}`);
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
    "Matched by position: the same test, its title formatted differently by each runner (Jest ⇄ Vitest)",
    c.entries.filter((e) => e.vitestTitle !== undefined && e.matchedBy !== "shape"),
    (e) => `${testName(e)}  ⇄  ${e.vitestTitle}`,
  );
  testList(
    "Matched by title shape — review: equal only if the values Jest and Vitest print are (unconfirmed)",
    c.entries.filter((e) => e.matchedBy === "shape"),
    (e) => `${testName(e)}  ~  ${e.vitestTitle ?? e.title}`,
  );
  testList(
    "Named differently? Jest's test has no Vitest test of that name; at its place Vitest has another (unconfirmed)",
    c.entries.filter((e) => e.vitestCandidate !== undefined),
    (e) => `${testName(e)}  ≠  ${e.vitestCandidate}`,
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
      vitestIgnoredErrors: c.vitest.ignoredErrors,
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
      ...(e.matchedBy ? { matchedBy: e.matchedBy } : {}),
      ...(e.vitestCandidate !== undefined ? { vitestCandidate: e.vitestCandidate } : {}),
      jest: e.jest,
      vitest: e.vitest,
      ...(e.hint ? { hint: e.hint } : {}),
    })),
  };
}
