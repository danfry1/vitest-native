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
  jsonReport,
  normaliseReport,
  renderComparison,
  type RunnerInfo,
  type RunnerResults,
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

const VALUED = [
  "root",
  "jest-args",
  "vitest-args",
  "vitest-config",
  "jest-results",
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
  // compare owns the reporters, output files and snapshot mode of both runs.
  const refusedJest = jestArgs.find((a) =>
    /^(-u|--updateSnapshot|--update-snapshot|--ci=false|--no-ci|--json|--outputFile|--output-file|--reporters|--watch|--watchAll)(=|$)/.test(
      a,
    ),
  );
  if (refusedJest) {
    return {
      error: `--jest-args may not contain ${refusedJest}: compare sets Jest's reporting and snapshot mode.`,
    };
  }
  const refusedVitest = vitestArgs.find((a) =>
    /^(-u|--update|--reporter|--outputFile|--config|-c|--watch|-w)([=.]|$)/.test(a),
  );
  if (refusedVitest) {
    return {
      error:
        `--vitest-args may not contain ${refusedVitest}: compare sets Vitest's reporting, snapshot ` +
        `mode and config (name a config with --vitest-config).`,
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
    json: values.get("json"),
    top,
    timeoutMs: timeout * 1000,
    showOutput: flags.has("show-output"),
  };
}

// ---------------------------------------------------------------------------
// Bounded child processes
// ---------------------------------------------------------------------------

interface Bounded {
  code: number | null;
  timedOut: boolean;
  interrupted: boolean;
  /** The last lines the process printed. */
  tail: string[];
}

/**
 * Run `node <args>` with a timeout. On POSIX the child leads its own process group, so
 * the whole group — the runner's workers included — can be signalled: on timeout or
 * Ctrl-C it gets SIGTERM, then SIGKILL after 5 s, and once the runner exits whatever is
 * left in its group is killed. Windows has no groups; `taskkill /T /F` ends the tree.
 */
function runBounded(
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; showOutput: boolean },
): Promise<Bounded> {
  return new Promise((resolve) => {
    const posix = process.platform !== "win32";
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: posix,
      windowsHide: true,
    });
    const tail: string[] = [];
    let partial = "";
    const onData = (chunk: Buffer) => {
      if (options.showOutput) process.stderr.write(chunk);
      const parts = (partial + chunk.toString()).split("\n");
      partial = parts.pop() ?? "";
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
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(escalate);
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      if (partial) tail.push(partial);
      resolve({ code, timedOut, interrupted, tail });
    };
    // Workers that outlive the runner hold its pipes open, so 'close' would wait for
    // them: reap the group as soon as the runner itself exits.
    child.on("exit", () => {
      if (posix) killTree("SIGKILL");
    });
    child.on("error", (error) => {
      tail.push(String(error));
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

/** The environment for a runner: a parent test runner's per-worker identity removed. */
function runnerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("VITEST") || key === "JEST_WORKER_ID") continue;
    env[key] = value;
  }
  // Neither runner writes snapshots under CI: Jest also gets --ci, and Vitest's
  // updateSnapshot is "none" when std-env reports CI (Vitest 4 and 5).
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

/** A relative import specifier from `fromDir` to `file`, with `/` separators. */
function importSpecifier(fromDir: string, file: string): string {
  const rel = path.relative(fromDir, file).split(path.sep).join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/**
 * The config compare's Vitest run loads: the project's config, unchanged, with
 * `resolveSnapshotPath` pointed at `__vitest_snapshots__/` when it sets none, so that
 * Vitest neither reads nor rewrites Jest's `.snap` files. With CI set, Vitest 5.0.5
 * still rewrote the header of every Jest snapshot file it read.
 */
export function wrapperSource(baseSpecifier: string, markerFile: string): string {
  return `import path from "node:path";
import { writeFileSync } from "node:fs";
import { mergeConfig } from "vitest/config";
import base from ${JSON.stringify(baseSpecifier)};

const resolveSnapshotPath = (testPath, extension) =>
  path.join(path.dirname(testPath), "__vitest_snapshots__", path.basename(testPath) + extension);

function withOwnSnapshots(config) {
  const resolved = config ?? {};
  if (resolved.test?.resolveSnapshotPath) return resolved;
  writeFileSync(${JSON.stringify(markerFile)}, "redirected");
  return mergeConfig(resolved, { test: { resolveSnapshotPath } });
}

export default typeof base === "function"
  ? async (env) => withOwnSnapshots(await base(env))
  : withOwnSnapshots(await base);
`;
}

/** The test script's flags that `migrate` maps into the Vitest config, for Jest too. */
function forwardedScriptFlags(root: string): { forwarded: string[]; ignored: string[] } {
  const forwarded: string[] = [];
  const ignored: string[] = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const script = pkg.scripts?.test;
    const parsed = typeof script === "string" ? parseJestScript("test", script) : null;
    for (const [name, value] of parsed?.flags ?? []) {
      if (["config", "c", "testTimeout", "maxWorkers", "w", "runInBand", "i"].includes(name)) {
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
  try {
    fs.mkdirSync(configParent, { recursive: true });
    configDir = fs.mkdtempSync(path.join(configParent, "compare-"));
    let baseFile: string;
    let vitestConfigLabel: string;
    if (vitestConfigFile) {
      baseFile = path.resolve(root, vitestConfigFile);
      vitestConfigLabel = vitestConfigFile;
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
    const marker = path.join(work, "snapshots-redirected");
    const wrapper = path.join(configDir, "vitest.compare.config.mjs");
    fs.writeFileSync(wrapper, wrapperSource(importSpecifier(configDir, baseFile), marker));

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
        [
          (jest as Located).bin,
          "--ci",
          "--json",
          `--outputFile=${out}`,
          ...script.forwarded,
          ...options.jestArgs,
        ],
        {
          cwd: root,
          env: runnerEnv(),
          timeoutMs: options.timeoutMs,
          showOutput: options.showOutput,
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

    // Vitest
    const vitestOut = path.join(work, "vitest.json");
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
        ...(options.showOutput ? ["--reporter=default"] : []),
        ...options.vitestArgs,
      ],
      { cwd: root, env: runnerEnv(), timeoutMs: options.timeoutMs, showOutput: options.showOutput },
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
      jestResults = normaliseReport(jestReport, "jest", { root });
      vitestResults = normaliseReport(vitestReport, "vitest", { root });
    } catch (error) {
      log(`✗ ${(error as Error).message}`);
      return 2;
    }
    const redirected = fs.existsSync(marker);
    const comparison = classify(jestResults, vitestResults, {
      vitestSnapshotRecorded: redirected
        ? (file) => {
            const abs = path.resolve(root, file);
            return fs.existsSync(
              path.join(path.dirname(abs), "__vitest_snapshots__", `${path.basename(abs)}.snap`),
            );
          }
        : undefined,
    });
    if (redirected) vitestInfo.config += "; snapshots read from __vitest_snapshots__/";
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
    if (options.json) {
      const report = jsonReport(comparison, {
        vitestNative: (installedManifest(root, "vitest-native")?.version as string) ?? null,
        jest: jestInfo,
        vitest: vitestInfo,
      });
      fs.writeFileSync(path.resolve(options.json), `${JSON.stringify(report, null, 2)}\n`);
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
