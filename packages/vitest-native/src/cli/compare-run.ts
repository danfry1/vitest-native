/**
 * `vitest-native compare`: the half that runs things. It runs the project's own Jest and
 * Vitest one after the other, each a bounded child process, and hands their JSON reports
 * to compare.ts. See docs/compare-mode.md.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  classify,
  foreignRoot,
  jsonReport,
  normaliseReport,
  renderComparison,
  sanitizeMessage,
  tmpSpellings,
  type RunnerInfo,
  type RunnerResults,
  type SnapshotHint,
} from "./compare.js";
import { parseJestScript } from "./jest-discovery.js";
import { installedManifest } from "./manifest.js";
import { analyzeJestConfig } from "./migrate.js";

export interface CompareOptions {
  root: string;
  jestArgs: string[];
  vitestArgs: string[];
  vitestConfig?: string;
  /** A Jest `--json` report made elsewhere, read instead of running Jest. */
  jestResults?: string;
  /** Where that report was made, when not detected from its paths. */
  jestRoot?: string;
  json?: string;
  top: number;
  timeoutMs: number;
  showOutput: boolean;
  log: (line: string) => void;
  /**
   * Not a CLI flag: copy each runner's raw report here (tests record fixtures with it).
   * Raw reports carry Jest's code frames, which the --json report removes.
   */
  rawReportsDir?: string;
}

/** Split an argument string into words: whitespace separates, quotes group. */
export function splitArgs(value: string): string[] {
  const words: string[] = [];
  let word: string | null = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "'" || c === '"') {
      const close = value.indexOf(c, i + 1);
      const stop = close === -1 ? value.length : close;
      word = (word ?? "") + value.slice(i + 1, stop);
      i = stop;
    } else if (/\s/.test(c)) {
      if (word !== null) words.push(word);
      word = null;
    } else {
      word = (word ?? "") + c;
    }
  }
  if (word !== null) words.push(word);
  return words;
}

// ---------------------------------------------------------------------------
// Arguments: an allow-list per runner
// ---------------------------------------------------------------------------

type ArgKind = "flag" | "value" | "false-only";
interface ArgSpec {
  long: Record<string, ArgKind>;
  short: Record<string, ArgKind>;
}

/**
 * The runner arguments compare passes through. Anything else is refused: a deny-list
 * let `-ut .` (Vitest's -u inside a cluster of short flags) and Jest's `--ci false`
 * through, and both write snapshots. Positional arguments (path filters) are allowed.
 */
const JEST_ARGS: ArgSpec = {
  long: {
    maxWorkers: "value",
    testTimeout: "value",
    runInBand: "flag",
    selectProjects: "value",
    testNamePattern: "value",
    testPathPatterns: "value",
    testPathPattern: "value",
    testPathIgnorePatterns: "value",
    shard: "value",
    silent: "flag",
    forceExit: "flag",
    detectOpenHandles: "flag",
    logHeapUsage: "flag",
    workerIdleMemoryLimit: "value",
    passWithNoTests: "flag",
    randomize: "flag",
    seed: "value",
    maxConcurrency: "value",
    watchAll: "false-only",
    watch: "false-only",
    cache: "flag",
    clearMocks: "flag",
  },
  short: { i: "flag", w: "value", t: "value" },
};

const VITEST_ARGS: ArgSpec = {
  long: {
    maxWorkers: "value",
    testTimeout: "value",
    hookTimeout: "value",
    teardownTimeout: "value",
    project: "value",
    testNamePattern: "value",
    shard: "value",
    pool: "value",
    silent: "flag",
    mode: "value",
    passWithNoTests: "flag",
    fileParallelism: "flag",
    isolate: "flag",
    retry: "value",
    dir: "value",
    logHeapUsage: "flag",
    watch: "false-only",
  },
  short: { t: "value" },
};

const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** The first argument the spec does not allow, with why, or null. */
export function refusedArg(args: string[], spec: ArgSpec): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("-")) continue; // a path filter
    if (arg.startsWith("--")) {
      const [rawName, inline] = arg.slice(2).split(/=(.*)/s, 2);
      let name = camel(rawName);
      let negated = false;
      if (!(name in spec.long) && name.startsWith("no") && /^no[A-Z]/.test(name)) {
        name = name[2].toLowerCase() + name.slice(3);
        negated = true;
      }
      const kind = spec.long[name];
      if (!kind) return arg;
      if (kind === "value") {
        if (negated) return arg;
        if (inline === undefined) {
          if (args[i + 1] === undefined) return `${arg} (no value)`;
          i++;
        }
      } else if (kind === "false-only") {
        if (!(negated || inline === "false")) return arg;
      } else if (inline !== undefined && inline !== "true" && inline !== "false") {
        return arg;
      }
      continue;
    }
    // A short flag stands alone: `-ut` is two flags, one of them -u.
    const short = arg.slice(1);
    const kind = spec.short[short];
    if (!kind) return arg;
    if (kind === "value") {
      if (args[i + 1] === undefined) return `${arg} (no value)`;
      i++;
    }
  }
  return null;
}

const VALUED = [
  "root",
  "jest-args",
  "vitest-args",
  "vitest-config",
  "jest-results",
  "jest-root",
  "json",
  "top",
  "timeout",
];
export const COMPARE_VALUED_FLAGS = VALUED.map((f) => `--${f}`);

/** `compare`'s options from argv (after the command), or an error to print. */
export function parseCompareArgs(argv: string[]): Omit<CompareOptions, "log"> | { error: string } {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (VALUED.includes(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined) return { error: `--${name} needs a value.` };
      values.set(name, value);
    } else {
      flags.add(name);
    }
  }
  const jestArgs = splitArgs(values.get("jest-args") ?? "");
  const vitestArgs = splitArgs(values.get("vitest-args") ?? "");
  const refusedJest = refusedArg(jestArgs, JEST_ARGS);
  if (refusedJest) {
    return {
      error:
        `--jest-args may not contain ${refusedJest}: compare passes only arguments that cannot write ` +
        `snapshots or replace its reports (see docs/compare-mode.md).`,
    };
  }
  const refusedVitest = refusedArg(vitestArgs, VITEST_ARGS);
  if (refusedVitest) {
    return {
      error:
        `--vitest-args may not contain ${refusedVitest}: compare passes only arguments that cannot write ` +
        `snapshots or replace its reports or config (name a config with --vitest-config).`,
    };
  }
  const top = Number(values.get("top") ?? 10);
  const timeout = Number(values.get("timeout") ?? 1800);
  if (!Number.isInteger(top) || top < 1) return { error: "--top needs a positive whole number." };
  if (!Number.isFinite(timeout) || timeout <= 0)
    return { error: "--timeout needs a number of seconds." };
  return {
    root: path.resolve(values.get("root") ?? "."),
    jestArgs,
    vitestArgs,
    vitestConfig: values.get("vitest-config"),
    jestResults: values.get("jest-results"),
    jestRoot: values.get("jest-root"),
    json: values.get("json"),
    top,
    timeoutMs: timeout * 1000,
    showOutput: flags.has("show-output"),
  };
}

// ---------------------------------------------------------------------------
// Bounded child processes
// ---------------------------------------------------------------------------

/**
 * Runs between compare and each runner: `node -e WATCHDOG -- <cleanup JSON> <runner
 * args…>`. It starts the runner on compare's pipes and exits with its code. When compare
 * dies without stopping it (SIGKILL, a crash), the IPC channel disconnects: it stops the
 * runner, removes compare's temporary directories and kills its own process group,
 * which holds the runner's workers. On Windows, which has no process groups, it ends
 * the runner's tree with taskkill, and after the runner exits it stops processes the
 * runner started that outlived it (orphans keep their parent's id).
 */
export const WATCHDOG = `
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const [cleanup, ...args] = process.argv.slice(1);
const win = process.platform === "win32";
const started = Date.now();
const child = spawn(process.execPath, args, { stdio: "inherit", windowsHide: true });
let orphaned = false;
function reapWindowsOrphans() {
  if (!win || child.pid === undefined) return;
  const since = Date.now() - started + 1000;
  const script =
    "$t=[DateTime]::Now.AddMilliseconds(-" + since + ");" +
    "function K($p){Get-CimInstance Win32_Process -Filter \\"ParentProcessId=$p\\" | " +
    "Where-Object { $_.CreationDate -ge $t } | ForEach-Object { K $_.ProcessId; " +
    "Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }; K " + child.pid;
  spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    stdio: "ignore", windowsHide: true, timeout: 20000,
  });
}
function shutdown(code) {
  if (orphaned) {
    for (const dir of JSON.parse(cleanup)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
    if (!win) { try { process.kill(-process.pid, "SIGKILL"); } catch {} }
  }
  process.exit(code);
}
child.on("exit", (code) => { reapWindowsOrphans(); shutdown(code ?? 1); });
child.on("error", () => shutdown(1));
process.on("disconnect", () => {
  orphaned = true;
  if (win) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else { try { child.kill("SIGTERM"); } catch {} }
  setTimeout(() => shutdown(1), 3000).unref();
});
`;

interface Bounded {
  code: number | null;
  timedOut: boolean;
  interrupted: boolean;
  /** The last lines the process printed. */
  tail: string[];
}

/** How long to wait for a runner's pipes after it exits: a test's own daemon can hold them. */
const DRAIN_MS = 2000;

/**
 * Run a runner (`node <args>`) under the watchdog, with a timeout. On POSIX the watchdog
 * leads its own process group, so the whole group — the runner's workers included — can
 * be signalled: on timeout, Ctrl-C, SIGTERM or SIGHUP it gets SIGTERM, then SIGKILL after
 * 5 s, and once the runner exits whatever is left in its group is killed. A process a
 * test starts in a session of its own is out of reach, as it is under the runners.
 */
function runBounded(
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    showOutput: boolean;
    cleanup: string[];
    onLine?: (line: string) => void;
  },
): Promise<Bounded> {
  return new Promise((resolve) => {
    const posix = process.platform !== "win32";
    const child = spawn(
      process.execPath,
      ["-e", WATCHDOG, "--", JSON.stringify(options.cleanup), ...args],
      {
        cwd: options.cwd,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        detached: posix,
        windowsHide: true,
      },
    );
    const tail: string[] = [];
    let partial = "";
    const onData = (chunk: Buffer) => {
      if (options.showOutput) process.stderr.write(chunk);
      const parts = (partial + chunk.toString()).split("\n");
      partial = parts.pop() ?? "";
      for (const line of parts) options.onLine?.(line);
      tail.push(...parts);
      if (tail.length > 40) tail.splice(0, tail.length - 40);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    const killTree = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      if (posix) {
        try {
          process.kill(-child.pid, signal);
        } catch {
          // the group is already gone
        }
      } else {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      }
    };
    let timedOut = false;
    let interrupted = false;
    let escalate: ReturnType<typeof setTimeout> | undefined;
    let drain: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      killTree("SIGTERM");
      escalate ??= setTimeout(() => killTree("SIGKILL"), 5000);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeoutMs);
    const onSignal = () => {
      interrupted = true;
      stop();
    };
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
    for (const s of signals) process.on(s, onSignal);

    let settled = false;
    let exitCode: number | null = null;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(escalate);
      clearTimeout(drain);
      for (const s of signals) process.off(s, onSignal);
      if (partial) {
        options.onLine?.(partial);
        tail.push(partial);
      }
      if (child.connected) child.disconnect();
      resolve({ code, timedOut, interrupted, tail });
    };
    child.on("exit", (code) => {
      exitCode = code;
      // Reap the group, then stop waiting for pipes a detached process may hold.
      if (posix) killTree("SIGKILL");
      drain = setTimeout(() => {
        child.stdout?.destroy();
        child.stderr?.destroy();
        finish(exitCode);
      }, DRAIN_MS);
    });
    child.on("error", (error) => {
      tail.push(String(error));
      finish(null);
    });
    child.on("close", (code) => finish(code ?? exitCode));
  });
}

/**
 * The environment for a runner: a parent test runner's per-worker identity removed, and
 * nothing that asks either runner to write snapshots.
 */
function runnerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("VITEST") || key === "JEST_WORKER_ID" || key === "UPDATE_SNAPSHOT") continue;
    env[key] = value;
  }
  // Jest also gets --ci (last); Vitest's updateSnapshot is "none" under CI with
  // update: false (Vitest 4 and 5), which the wrapper config sets.
  env.CI = "true";
  return env;
}

// ---------------------------------------------------------------------------
// Locating the runners and configs
// ---------------------------------------------------------------------------

interface Located {
  bin: string;
  version: string | null;
}

/** A package's bin, found as installedManifest finds the package (walking node_modules up). */
function locateBin(root: string, pkg: string, binName: string): Located | null {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const pkgDir = path.join(dir, "node_modules", pkg);
    if (fs.existsSync(path.join(pkgDir, "package.json"))) {
      const manifest = installedManifest(dir, pkg) ?? {};
      const bin = manifest.bin;
      const relative =
        typeof bin === "string" ? bin : (bin as Record<string, string> | undefined)?.[binName];
      if (!relative) return null;
      return {
        bin: path.join(fs.realpathSync(pkgDir), relative),
        version: typeof manifest.version === "string" ? manifest.version : null,
      };
    }
    if (path.dirname(dir) === dir) return null;
  }
}

/** The config Vitest itself would load from the root (vitest.config.* before vite.config.*). */
export function findVitestConfig(root: string): string | null {
  for (const base of ["vitest.config", "vite.config"]) {
    for (const ext of [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"]) {
      if (fs.existsSync(path.join(root, base + ext))) return base + ext;
    }
  }
  return null;
}

/**
 * An import specifier from `fromDir` to `file`: relative with `/` separators, or the
 * absolute path with `/` separators when no relative path exists (another drive).
 */
export function importSpecifier(fromDir: string, file: string, p: typeof path = path): string {
  const rel = p.relative(fromDir, file);
  if (p.isAbsolute(rel)) return rel.split(p.sep).join("/");
  const forward = rel.split(p.sep).join("/");
  return forward.startsWith(".") ? forward : `./${forward}`;
}

/**
 * The config compare's Vitest run loads: the project's config, unchanged, except that
 * every snapshot file it resolves — through its own resolveSnapshotPath, a project's, or
 * the `__vitest_snapshots__/` recipe when it sets none — is read from a copy in an
 * isolated directory, and `update` is false. Only files with Vitest's header are copied:
 * Vitest cannot read Jest's (other keys), and with CI set Vitest 5.0.5 still rewrote the
 * header of every Jest .snap file it read. Each resolution is logged to `manifest`.
 */
export function wrapperSource(
  baseSpecifier: string,
  isolated: string,
  manifest: string,
  root: string,
): string {
  return `import path from "node:path";
import fs from "node:fs";
import { mergeConfig } from "vitest/config";
import base from ${JSON.stringify(baseSpecifier)};

const ROOT = ${JSON.stringify(root)};
const ISOLATED = ${JSON.stringify(isolated)};
const MANIFEST = ${JSON.stringify(manifest)};
const recipe = (testPath, extension) =>
  path.join(path.dirname(testPath), "__vitest_snapshots__", path.basename(testPath) + extension);
const seen = new Set();

function isolate(own) {
  return (testPath, extension, context) => {
    const original = own ? own(testPath, extension, context) : recipe(testPath, extension);
    const rel = path.relative(ROOT, original);
    const inside = rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
    const target = path.join(ISOLATED, inside ? rel : path.join("outside", Buffer.from(original).toString("hex").slice(-80)));
    if (!seen.has(target)) {
      seen.add(target);
      let header = null;
      try { header = fs.readFileSync(original, "utf8").slice(0, 40); } catch {}
      const vitests = header !== null && header.startsWith("// Vitest Snapshot");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (vitests) fs.copyFileSync(original, target);
      fs.appendFileSync(MANIFEST, JSON.stringify({ testPath, original, copied: vitests, foreign: header !== null && !vitests }) + "\\n");
    }
    return target;
  };
}

// Vitest 5.0.5 resolves every project's snapshots through the root's setting (one
// SnapshotManager), so the root's isolation covers inline projects there; a project's own
// is wrapped too, for a Vitest that honours it.
function isolateProject(project, inherited) {
  if (!project || typeof project !== "object" || typeof project.then === "function") return project;
  const test = project.test ?? {};
  const own = test.resolveSnapshotPath ?? (project.extends ? inherited : undefined);
  return { ...project, test: { ...test, resolveSnapshotPath: isolate(own) } };
}

function compareConfig(config) {
  const resolved = mergeConfig(config ?? {}, {});
  const test = resolved.test ?? {};
  const own = test.resolveSnapshotPath;
  resolved.test = {
    ...test,
    resolveSnapshotPath: isolate(own),
    projects: Array.isArray(test.projects) ? test.projects.map((p) => isolateProject(p, own)) : test.projects,
    update: false,
  };
  return resolved;
}

export default typeof base === "function"
  ? async (env) => compareConfig(await base(env))
  : compareConfig(await base);
`;
}

/** The `test` script's flags `migrate` maps into the Vitest config, for Jest too. */
const FORWARDED = [
  "config",
  "c",
  "testTimeout",
  "maxWorkers",
  "w",
  "runInBand",
  "i",
  "silent",
  "passWithNoTests",
];

export function forwardedScriptFlags(root: string): { forwarded: string[]; ignored: string[] } {
  const forwarded: string[] = [];
  const ignored: string[] = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const script = pkg.scripts?.test;
    const parsed = typeof script === "string" ? parseJestScript("test", script) : null;
    for (const [name, value] of parsed?.flags ?? []) {
      if (FORWARDED.includes(name)) {
        const long = { c: "config", w: "maxWorkers", i: "runInBand" }[name] ?? name;
        forwarded.push(value === true ? `--${long}` : `--${long}=${value}`);
      } else if (!["ci", "json", "outputFile", "watch", "watchAll", "coverage"].includes(name)) {
        ignored.push(`--${name}`);
      }
    }
  } catch {
    // no/invalid package.json: nothing to forward
  }
  return { forwarded, ignored };
}

// ---------------------------------------------------------------------------
// The project tree: compare must leave it as it found it
// ---------------------------------------------------------------------------

type TreeState = Map<string, string>;

/**
 * Size and modification time of every file under the root except node_modules and
 * .git, where the runners keep their caches. Snapshot files, inline snapshots in test
 * sources and toMatchFileSnapshot outputs are all in it.
 */
export function treeState(root: string, limit = 200_000): TreeState | null {
  const out: TreeState = new Map();
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile()) {
        try {
          const s = fs.statSync(abs);
          out.set(path.relative(root, abs).split(path.sep).join("/"), `${s.size}:${s.mtimeMs}`);
        } catch {
          // gone already
        }
        if (out.size > limit) return null;
      }
    }
  }
  return out;
}

export function treeChanges(before: TreeState, after: TreeState): string[] {
  const changes: string[] = [];
  for (const [file, state] of after) {
    if (!before.has(file)) changes.push(`added ${file}`);
    else if (before.get(file) !== state) changes.push(`changed ${file}`);
  }
  for (const file of before.keys()) if (!after.has(file)) changes.push(`removed ${file}`);
  return changes.sort();
}

// ---------------------------------------------------------------------------
// compare
// ---------------------------------------------------------------------------

function readReport(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function seconds(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`;
}

interface ManifestEntry {
  testPath: string;
  original: string;
  copied: boolean;
  foreign: boolean;
}

/** Reads Vitest's own output for what its JSON report leaves out. */
export function vitestOutputReader(sanitize: (s: string) => string) {
  const errors: string[] = [];
  let engine: string | null = null;
  let pending: string | null = null;
  // oxlint-disable-next-line no-control-regex -- ANSI escapes
  const plain = (line: string) => line.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
  return {
    errors,
    engine: () => engine,
    onLine(raw: string) {
      const line = plain(raw);
      const m = /\[vitest-native\] engine: ([\w-]+)/.exec(line);
      if (m) engine ??= m[1];
      const header = /⎯+\s*(Unhandled (?:Rejection|Error)|Uncaught Exception)\s*⎯+/.exec(line);
      if (header) {
        pending = header[1];
        return;
      }
      if (pending && line.trim() !== "") {
        errors.push(`${pending}: ${sanitize(line.trim())}`);
        pending = null;
        return;
      }
      const close = /^error during close (.*)$/.exec(line);
      if (close) errors.push(`error during close: ${sanitize(close[1])}`);
    },
  };
}

export async function runCompare(options: CompareOptions): Promise<number> {
  const { root, log } = options;
  const vitest = locateBin(root, "vitest", "vitest");
  const jest = options.jestResults ? null : locateBin(root, "jest", "jest");
  if (!vitest) {
    log(`✗ Vitest is not installed at ${root}; compare runs the project's own Vitest.`);
    return 2;
  }
  if (!options.jestResults && !jest) {
    log(
      `✗ Jest is not installed at ${root}; compare runs the project's own Jest ` +
        `(or reads a Jest --json report given with --jest-results).`,
    );
    return 2;
  }

  const analysis = analyzeJestConfig(root);
  const vitestConfigFile = options.vitestConfig ?? findVitestConfig(root);
  if (options.vitestConfig && !fs.existsSync(path.resolve(root, options.vitestConfig))) {
    log(`✗ --vitest-config ${options.vitestConfig} does not exist under ${root}.`);
    return 2;
  }

  // Reports go to the system temp directory. The Vitest config must sit under the root,
  // so that its bare imports resolve from the project's node_modules.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vn-compare-"));
  const nodeModules = path.join(root, "node_modules");
  const hadNodeModules = fs.existsSync(nodeModules);
  const configParent = path.join(nodeModules, ".vitest-native");
  const hadConfigParent = fs.existsSync(configParent);
  let configDir: string | null = null;
  const before = treeState(root);
  try {
    fs.mkdirSync(configParent, { recursive: true });
    configDir = fs.mkdtempSync(path.join(configParent, "compare-"));
    const cleanup = [work, configDir];
    let baseFile: string;
    let vitestConfigLabel: string;
    if (vitestConfigFile) {
      baseFile = path.resolve(root, vitestConfigFile);
      const rel = path.relative(root, baseFile);
      vitestConfigLabel =
        rel.startsWith("..") || path.isAbsolute(rel)
          ? path.basename(baseFile)
          : rel.split(path.sep).join("/");
    } else {
      // The config `migrate --write` would save, executed in place: its paths are
      // written relative to import.meta.url, which here must be the root's.
      baseFile = path.join(configDir, "migrate.config.mjs");
      const rootUrl = pathToFileURL(root + path.sep).href;
      fs.writeFileSync(
        baseFile,
        analysis.suggestedConfig.replaceAll("import.meta.url", JSON.stringify(rootUrl)),
      );
      vitestConfigLabel = "the one `vitest-native migrate` suggests (not saved)";
    }
    const manifest = path.join(work, "snapshots.jsonl");
    const wrapper = path.join(configDir, "vitest.compare.config.mjs");
    fs.writeFileSync(
      wrapper,
      wrapperSource(
        importSpecifier(configDir, baseFile),
        path.join(configDir, "snapshots"),
        manifest,
        root,
      ),
    );

    const jestInfo: RunnerInfo = {
      version: jest?.version ?? null,
      config: options.jestResults
        ? `report ${path.basename(options.jestResults)}`
        : (analysis.source ?? "Jest's defaults (no Jest config found)"),
    };
    const vitestInfo: RunnerInfo = { version: vitest.version, config: vitestConfigLabel };

    // Jest
    let jestReport: unknown;
    if (options.jestResults) {
      jestReport = readReport(path.resolve(options.jestResults));
      if (jestReport === null) {
        log(`✗ could not read a JSON report from ${options.jestResults}.`);
        return 2;
      }
    } else {
      const out = path.join(work, "jest.json");
      const script = forwardedScriptFlags(root);
      if (script.ignored.length) {
        log(
          `  scripts.test also passes ${script.ignored.join(" ")} to Jest; not forwarded ` +
            `(add them with --jest-args if they matter).`,
        );
      }
      const started = Date.now();
      log(`Running Jest ${jest?.version ?? ""}…`);
      const run = await runBounded(
        // --ci last, after anything forwarded, so nothing can turn it off.
        [
          (jest as Located).bin,
          "--json",
          `--outputFile=${out}`,
          ...script.forwarded,
          ...options.jestArgs,
          "--ci",
        ],
        {
          cwd: root,
          env: runnerEnv(),
          timeoutMs: options.timeoutMs,
          showOutput: options.showOutput,
          cleanup,
        },
      );
      const failure = runFailure("Jest", run, options.timeoutMs);
      if (failure) return reportFailure(log, failure, run);
      jestReport = readReport(out);
      if (jestReport === null) {
        return reportFailure(
          log,
          `Jest exited (${run.code}) without writing its JSON report.`,
          run,
        );
      }
      log(`  done in ${seconds(started)}`);
    }

    // Vitest: the JSON report plus the default reporter, whose output is the only place
    // unhandled errors and errors during close appear.
    const vitestOut = path.join(work, "vitest.json");
    const sanitizeCtx = {
      roots: [root, fs.realpathSync(root)],
      tmp: tmpSpellings(),
      home: os.homedir(),
    };
    const reader = vitestOutputReader((s) => sanitizeMessage(s, sanitizeCtx));
    const started = Date.now();
    log(`Running Vitest ${vitest.version ?? ""}…`);
    const run = await runBounded(
      [
        vitest.bin,
        // No --root: cwd is the root, and a root the config sets must keep applying.
        "run",
        "--config",
        wrapper,
        "--reporter=json",
        `--outputFile.json=${vitestOut}`,
        "--reporter=default",
        ...options.vitestArgs,
      ],
      {
        cwd: root,
        env: runnerEnv(),
        timeoutMs: options.timeoutMs,
        showOutput: options.showOutput,
        cleanup,
        onLine: reader.onLine,
      },
    );
    const failure = runFailure("Vitest", run, options.timeoutMs);
    if (failure) return reportFailure(log, failure, run);
    const vitestReport = readReport(vitestOut);
    if (vitestReport === null) {
      return reportFailure(
        log,
        `Vitest exited (${run.code}) without writing its JSON report.`,
        run,
      );
    }
    log(`  done in ${seconds(started)}`);
    log("");

    if (options.rawReportsDir) {
      fs.mkdirSync(options.rawReportsDir, { recursive: true });
      const save = (name: string, report: unknown) =>
        fs.writeFileSync(path.join(options.rawReportsDir as string, name), JSON.stringify(report));
      save("jest.json", jestReport);
      save("vitest.json", vitestReport);
    }
    let jestResults: RunnerResults;
    let vitestResults: RunnerResults;
    try {
      vitestResults = normaliseReport(vitestReport, "vitest", { root });
      // A report made in CI names files under that machine's checkout.
      let aliases = options.jestRoot ? [options.jestRoot] : [];
      if (!aliases.length && options.jestResults) {
        const local = [...vitestResults.files.keys()];
        const probe = normaliseReport(jestReport, "jest", { root });
        const outside = [...probe.files.keys()].some((f) => /^(\/|\.\.\/|[a-z]:)/.test(f));
        const prefix = outside ? foreignRoot(jestReport, local) : null;
        if (prefix) {
          aliases = [prefix];
          log(
            `  Jest's report was made at ${prefix}; its paths are read relative to that directory.`,
          );
        }
      }
      jestResults = normaliseReport(jestReport, "jest", { root, aliases });
    } catch (error) {
      log(`✗ ${(error as Error).message}`);
      return 2;
    }

    const resolutions = new Map<string, ManifestEntry>();
    if (fs.existsSync(manifest)) {
      for (const line of fs.readFileSync(manifest, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const entry = JSON.parse(line) as ManifestEntry;
        const rel = path.relative(root, entry.testPath).split(path.sep).join("/");
        resolutions.set(rel, entry);
      }
    }
    const comparison = classify(jestResults, vitestResults, {
      snapshotHint: (file, message) => snapshotHint(root, resolutions.get(file), file, message),
      vitestRun: { exitCode: run.code, errors: reader.errors, engine: reader.engine() },
    });
    vitestInfo.config += "; snapshots read from an isolated copy";
    for (const line of renderComparison(comparison, {
      jest: jestInfo,
      vitest: vitestInfo,
      top: options.top,
      jsonPath: options.json ?? null,
    })) {
      log(line);
    }
    if (!vitestConfigFile && analysis.attention.length) {
      log(
        `Note: \`vitest-native migrate\` lists ${analysis.attention.length} item(s) that need attention; ` +
          `they can explain differences.`,
      );
    }
    // compare must leave the project as it found it; anything else is an error. Checked
    // before the --json report is written, which may be inside the root.
    const after = treeState(root);
    const changes = before && after ? treeChanges(before, after) : [];
    if (!before || !after)
      log("  The project has too many files to check that the runs changed none.");
    if (options.json) {
      const report = jsonReport(comparison, {
        vitestNative: (installedManifest(root, "vitest-native")?.version as string) ?? null,
        jest: jestInfo,
        vitest: vitestInfo,
      });
      report.projectChanges = changes;
      fs.writeFileSync(path.resolve(options.json), `${JSON.stringify(report, null, 2)}\n`);
    }
    if (changes.length) {
      log("");
      log(
        `✗ The runs changed ${changes.length} file(s) in the project, which compare must never do:`,
      );
      for (const c of changes.slice(0, options.top)) log(`    ${c}`);
      if (changes.length > options.top) log(`    … and ${changes.length - options.top} more`);
      log("  Restore them from version control, and report this with the command you ran.");
      return 2;
    }
    if (comparison.jestPassed === 0) return 2;
    return comparison.claimHolds ? 0 : 1;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    if (configDir) fs.rmSync(configDir, { recursive: true, force: true });
    // Leave node_modules as it was: remove what compare created, if it is empty.
    for (const [dir, existed] of [
      [configParent, hadConfigParent],
      [nodeModules, hadNodeModules],
    ] as const) {
      if (existed) continue;
      try {
        fs.rmdirSync(dir);
      } catch {
        // not empty, or already gone
      }
    }
  }
}

/**
 * Which snapshot hint a Vitest snapshot mismatch gets. Inline and file snapshots fail with
 * the same message as a `.snap` one, and recording those is not what the hints say, so
 * a test gets one only when it is a `.snap` case: its key, in Jest's spelling (Vitest's
 * `a > b 1` is Jest's `a b 1`), is in Jest's `.snap` file, which it must be for the test
 * to have passed under Jest. Then: Vitest's config resolves to Jest's own file
 * (`shared-snapshot-dir`), or Vitest's own file lacks the key (`no-vitest-snapshot`).
 */
function snapshotHint(
  root: string,
  resolution: ManifestEntry | undefined,
  file: string,
  message: string,
): SnapshotHint | undefined {
  const key = /Snapshot `([^`]*)` mismatched/.exec(message)?.[1];
  if (!key || !resolution) return undefined;
  const read = (p: string) => {
    try {
      return fs.readFileSync(p, "utf8");
    } catch {
      return "";
    }
  };
  const abs = path.resolve(root, file);
  const jestFile = resolution.foreign
    ? resolution.original
    : path.join(path.dirname(abs), "__snapshots__", `${path.basename(abs)}.snap`);
  const jestKey = key.split(" > ").join(" ");
  if (!read(jestFile).includes(`exports[\`${jestKey}\`]`)) return undefined;
  if (resolution.foreign) return "shared-snapshot-dir";
  if (!resolution.copied) return "no-vitest-snapshot";
  return read(resolution.original).includes(`exports[\`${key}\`]`)
    ? undefined
    : "no-vitest-snapshot";
}

function runFailure(name: string, run: Bounded, timeoutMs: number): string | null {
  if (run.interrupted) return `${name} was interrupted.`;
  if (run.timedOut) {
    return `${name} did not finish within ${timeoutMs / 1000}s and was stopped; raise --timeout if the suite needs longer.`;
  }
  return null;
}

function reportFailure(log: (line: string) => void, message: string, run: Bounded): number {
  log(`✗ ${message}`);
  const tail = run.tail.filter((l) => l.trim() !== "").slice(-20);
  if (tail.length) {
    log("  Last output:");
    for (const line of tail) log(`    ${line}`);
  }
  return run.interrupted ? 130 : 2;
}
