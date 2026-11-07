/**
 * `vitest-native compare --hot`: runs the project's own Vitest config per file and with
 * `hotRuntime: 'auto'`, then reports every test whose result differs (compare-hot.ts holds
 * the rules). It reuses compare's machinery: the wrapper config with isolated snapshots,
 * the bounded runner with its watchdog and guardian, and the check that the runs leave the
 * project unchanged.
 *
 * The runs: per file ×N, hot ×N, one hot run with shuffled file order (unless --no-shuffle),
 * and one hot run at --maxWorkers=2 (more files share a worker, so a carry-over has more
 * chances). The first run of each mode warms caches and is compared but not timed when N > 1.
 * Every hot run must show the engine's hot banner. A declined 'auto' ("hot runtime off: …")
 * gives no verdict, since that run was per file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeJestConfig } from "./migrate.js";
import {
  testName,
  normaliseReport,
  sanitizeMessage,
  tmpSpellings,
  type NormaliseContext,
} from "./compare.js";
import {
  findVitestConfig,
  importSpecifier,
  locateBin,
  readReport,
  reportFailure,
  runBounded,
  runFailure,
  runnerEnv,
  seconds,
  SIGNALS,
  startGuardian,
  treeChanges,
  treeState,
  unreadablePaths,
  vitestOutputReader,
  wrapperSource,
  type CompareOptions,
} from "./compare-run.js";
import { compareHotRuns, type HotMode, type HotRun, type HotVerdict } from "./compare-hot.js";

export interface CompareHotOptions extends Pick<
  CompareOptions,
  "root" | "vitestArgs" | "vitestConfig" | "json" | "timeoutMs" | "showOutput" | "log"
> {
  /** Runs per mode (at least 1; the default 2 lets the first warm caches). */
  runs: number;
  /** One extra hot run with shuffled file order. */
  shuffle: boolean;
  seed: number;
}

interface PlannedRun {
  mode: HotMode;
  label: string;
  args: string[];
  seed?: number;
  untimed?: boolean;
}

export function plannedRuns(
  options: Pick<CompareHotOptions, "runs" | "shuffle" | "seed">,
): PlannedRun[] {
  const runs: PlannedRun[] = [];
  for (let i = 1; i <= options.runs; i++)
    runs.push({ mode: "per-file", label: `per-file ${i}`, args: [] });
  for (let i = 1; i <= options.runs; i++) runs.push({ mode: "hot", label: `hot ${i}`, args: [] });
  if (options.shuffle) {
    runs.push({
      mode: "hot",
      label: `hot shuffled (seed ${options.seed})`,
      args: ["--sequence.shuffle.files", `--sequence.seed=${options.seed}`],
      seed: options.seed,
    });
  }
  runs.push({
    mode: "hot",
    label: "hot at --maxWorkers=2",
    args: ["--maxWorkers=2"],
    untimed: true,
  });
  return runs;
}

/**
 * Whether the run's own banner confirms the mode: a hot run must report the hot runtime and
 * no decline; a per-file run must not report it. Returns the problem, or null.
 */
export function bannerProblem(mode: HotMode, output: string): string | null {
  if (mode === "hot" && /'hotRuntime' only applies to engine:'native'/.test(output)) {
    return "the hot runtime runs only under the native engine, and this config resolves to the mock engine";
  }
  // A decline at configureVitest ("hot runtime off: …") or in any project's config()
  // ("hotRuntime:'auto' kept default isolation: …"): that part of the run was per file.
  const declined =
    /\[vitest-native\] hot runtime off: ([^\n]*)/.exec(output) ??
    /\[vitest-native\] hotRuntime:'auto' kept default isolation: ([^\n]*)/.exec(output);
  const engine = /\[vitest-native\] engine: [^\n]*/.exec(output)?.[0] ?? null;
  if (engine === null) return "the run printed no vitest-native engine banner";
  // The banner's parenthesis lists the platform, then ", hot runtime", then any other notes.
  const hot = /, hot runtime[,)]/.test(engine);
  if (mode === "hot" && declined) return `hotRuntime 'auto' declined: ${declined[1].trim()}`;
  if (mode === "hot" && !hot) return "the hot run's engine banner does not report the hot runtime";
  if (mode === "per-file" && hot) return "the per-file run reports the hot runtime";
  return null;
}

function snapshotsOf(report: unknown): { written: number; obsolete: number } | undefined {
  const snap = (report as { snapshot?: { added?: number; unchecked?: number } } | null)?.snapshot;
  if (!snap) return undefined;
  return { written: snap.added ?? 0, obsolete: snap.unchecked ?? 0 };
}

// oxlint-disable-next-line no-control-regex -- ANSI escapes
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const withoutAnsi = (text: string) => text.replace(ANSI, "");

/** Records each test that passed only after a retry (Vitest 5 reporter API). */
const RETRY_REPORTER = `import fs from "node:fs";
export default class RetryReporter {
  onTestCaseResult(testCase) {
    const d = testCase.diagnostic?.();
    if (!d || !d.retryCount || testCase.result().state !== "passed") return;
    const names = [];
    for (let s = testCase.parent; s && s.type === "suite"; s = s.parent) names.unshift(s.name);
    fs.appendFileSync(process.env.VN_COMPARE_RETRIES, JSON.stringify({ file: testCase.module.moduleId, names, title: testCase.name }) + "\\n");
  }
}
`;

function readRetried(file: string, root: string): Set<string> {
  const out = new Set<string>();
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as { file: string; names: string[]; title: string };
    const rel = path.relative(root, r.file).split(path.sep).join("/");
    out.add(testName({ file: rel, ancestors: r.names, title: r.title }));
  }
  return out;
}

const fmtS = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} s`);

export function renderHotVerdict(v: HotVerdict, runs: HotRun[], top = 20): string[] {
  const lines: string[] = [];
  const count = (m: HotMode) => runs.filter((r) => r.mode === m).length;
  const seeds = runs.filter((r) => r.seed !== undefined).map((r) => r.seed);
  lines.push("");
  for (const r of runs) {
    lines.push(
      `  ${(r.label ?? r.mode).padEnd(32)} ${fmtS(r.wallMs)}${r.untimed ? " (not timed)" : ""}`,
    );
  }
  lines.push("");
  const runsText =
    `${count("per-file")} per-file and ${count("hot")} hot runs` +
    (seeds.length ? ` (shuffle seed ${seeds.join(", ")})` : "");
  if (v.noDifference) {
    lines.push(`✓ No difference in ${runsText}: ${v.testsCompared} tests compared.`);
    if (v.judgedBySubset) {
      lines.push(
        `  ${v.judgedBySubset} of them are flaky per file and were judged by the subset rule.`,
      );
    }
    const samples = Math.min(v.wallsMs["per-file"].length, v.wallsMs.hot.length);
    const note = samples < 2 ? " (one timed sample per mode)" : "";
    if (v.speedup !== null && v.speedup > 1.05) {
      lines.push(
        `  Median wall: per file ${fmtS(v.medianMs["per-file"])}, hot ${fmtS(v.medianMs.hot)}: ` +
          `${v.speedup.toFixed(1)}× faster${note}.`,
      );
      lines.push(
        `  hotRuntime: 'auto' showed no difference for this suite. To use it, add it to reactNative({ … }).`,
      );
    } else {
      lines.push(
        `  Median wall: per file ${fmtS(v.medianMs["per-file"])}, hot ${fmtS(v.medianMs.hot)}${note}: ` +
          `hot is not faster here, so there is nothing to gain by switching.`,
      );
    }
  } else {
    lines.push(`✗ Differences in ${runsText} (${v.testsCompared} tests compared):`);
    for (const d of v.differences.slice(0, top)) {
      lines.push(
        `  - [${d.kind}] ${d.test}: per file ${d.perFile}, hot ${d.hot}` +
          (d.seed !== undefined ? ` (seed ${d.seed})` : "") +
          (d.message ? `\n      ${d.message}` : ""),
      );
    }
    if (v.differences.length > top)
      lines.push(`  … and ${v.differences.length - top} more (--json lists all).`);
    for (const f of v.hotFlakes.slice(0, top)) {
      lines.push(`  - [hot flake] ${f.test}: ${f.statuses.join(" / ")}`);
    }
    lines.push("  Keep hotRuntime off for this suite, or fix these tests first.");
  }
  if (v.perFileFlakes.length) {
    lines.push(
      `  Note: ${v.perFileFlakes.length} test(s) also vary between per-file runs (the suite is flaky without hot):`,
    );
    for (const f of v.perFileFlakes.slice(0, 5))
      lines.push(`    ${f.test}: ${f.statuses.join(" / ")}`);
  }
  return lines;
}

export async function runCompareHot(options: CompareHotOptions): Promise<number> {
  const { root, log } = options;
  const vitest = locateBin(root, "vitest", "vitest");
  if (!vitest) {
    log(`✗ Vitest is not installed at ${root}; compare --hot runs the project's own Vitest.`);
    return 2;
  }
  const vitestConfigFile = options.vitestConfig ?? findVitestConfig(root);
  if (options.vitestConfig && !fs.existsSync(path.resolve(root, options.vitestConfig))) {
    log(`✗ --vitest-config ${options.vitestConfig} does not exist under ${root}.`);
    return 2;
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vn-compare-hot-"));
  const nodeModules = path.join(root, "node_modules");
  const hadNodeModules = fs.existsSync(nodeModules);
  const configParent = path.join(nodeModules, ".vitest-native");
  const hadConfigParent = fs.existsSync(configParent);
  fs.mkdirSync(configParent, { recursive: true });
  const configDir = fs.mkdtempSync(path.join(configParent, "compare-hot-"));
  const cleanup = [work, configDir];
  const guardian = startGuardian(cleanup, [
    ...(hadConfigParent ? [] : [configParent]),
    ...(hadNodeModules ? [] : [nodeModules]),
  ]);
  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
  };
  for (const s of SIGNALS) process.on(s, onSignal);
  const before = treeState(root);
  const notChecked = before ? unreadablePaths(before) : [];
  if (notChecked.length) {
    log(
      `  ${notChecked.length} path(s) could not be read, so the no-changes check does not cover them.`,
    );
  }
  try {
    let baseFile: string;
    if (vitestConfigFile) {
      baseFile = path.resolve(root, vitestConfigFile);
    } else {
      const analysis = analyzeJestConfig(root);
      baseFile = path.join(configDir, "migrate.config.mjs");
      const rootUrl = pathToFileURL(root + path.sep).href;
      fs.writeFileSync(
        baseFile,
        analysis.suggestedConfig.replaceAll("import.meta.url", JSON.stringify(rootUrl)),
      );
    }
    // One wrapper per run, each with its own isolated snapshot directory, so each run's
    // snapshot reads and its obsolete count are its own, not shaped by the runs before it.
    // (compare writes no snapshot: update is false and CI is set.)
    const wrapperFor = (n: number, mode: HotMode) => {
      const file = path.join(configDir, `vitest.compare-${n}.config.mjs`);
      fs.writeFileSync(
        file,
        wrapperSource(
          importSpecifier(configDir, baseFile),
          path.join(configDir, `snapshots-${n}`),
          path.join(work, `snapshots-${n}.jsonl`),
          root,
          mode === "hot" ? "auto" : false,
        ),
      );
      return file;
    };
    // A reporter of compare's own: Vitest's JSON report has no retry count.
    const retryReporter = path.join(configDir, "retries-reporter.mjs");
    fs.writeFileSync(retryReporter, RETRY_REPORTER);
    const retriesFile = (n: number) => path.join(work, `retries-${n}.jsonl`);
    const problemFile = (n: number) => path.join(work, `problem-${n}.txt`);
    const sanitizeCtx = {
      // A path Vitest prints under either root is shortened: the root as given, and Node's
      // spelling of it (fs.realpathSync), which the reports use.
      roots: [root, fs.realpathSync(root)],
      tmp: tmpSpellings(),
      home: os.homedir(),
    };
    const normCtx: NormaliseContext = { root, home: os.homedir() };

    const done: HotRun[] = [];
    let index = 0;
    for (const planned of plannedRuns(options)) {
      if (interrupted) break;
      index++;
      const out = path.join(work, `run-${index}.json`);
      const reader = vitestOutputReader((s) => sanitizeMessage(s, sanitizeCtx));
      let output = "";
      const started = Date.now();
      log(`Running Vitest ${vitest.version ?? ""}, ${planned.label}…`);
      const run = await runBounded(
        [
          vitest.bin,
          "run",
          "--config",
          wrapperFor(index, planned.mode),
          "--reporter=json",
          `--outputFile.json=${out}`,
          "--reporter=default",
          `--reporter=${retryReporter}`,
          "--coverage.enabled=false",
          ...options.vitestArgs,
          // Last, so the labelled runs keep their own settings.
          ...planned.args,
        ],
        {
          cwd: root,
          env: {
            ...runnerEnv(),
            VN_COMPARE_RETRIES: retriesFile(index),
            VN_COMPARE_PROBLEM: problemFile(index),
          },
          timeoutMs: options.timeoutMs,
          showOutput: options.showOutput,
          cleanup,
          onLine: (line, stream) => {
            output += `${line}\n`;
            reader.onLine(line, stream);
          },
        },
      );
      const wallMs = Date.now() - started;
      if (fs.existsSync(problemFile(index))) {
        for (const problem of fs.readFileSync(problemFile(index), "utf8").split("\n")) {
          log(`✗ ${planned.label}: ${problem}.`);
        }
        log("  No verdict: compare could not run this config in one mode.");
        return 2;
      }
      const failure = runFailure("Vitest", run, options.timeoutMs);
      if (failure) return reportFailure(log, `${planned.label}: ${failure}`, run);
      const report = readReport(out);
      if (report === null)
        return reportFailure(
          log,
          `${planned.label}: Vitest exited (${run.code}) without its JSON report.`,
          run,
        );
      const banner = bannerProblem(planned.mode, withoutAnsi(output));
      if (banner) {
        return reportFailure(
          log,
          `${planned.label}: ${banner}. No verdict: the two modes were not both run.`,
          run,
        );
      }
      let results;
      try {
        results = normaliseReport(report, "vitest", normCtx);
      } catch (error) {
        log(
          `✗ ${planned.label}: Vitest's JSON report could not be read: ${(error as Error).message}`,
        );
        return 2;
      }
      done.push({
        mode: planned.mode,
        label: planned.label,
        results,
        retried: readRetried(retriesFile(index), root),
        wallMs,
        seed: planned.seed,
        untimed: planned.untimed,
        unhandledErrors: reader.errors.length,
        snapshots: snapshotsOf(report),
      });
      log(`  done in ${seconds(started)}`);
    }

    const after = treeState(root);
    const changes = before && after ? treeChanges(before, after) : { fatal: [], other: [] };
    if (changes.fatal.length) {
      log(
        `✗ The runs changed ${changes.fatal.length} snapshot or source file(s) in the project; no verdict.`,
      );
      for (const c of changes.fatal.slice(0, 10)) log(`    ${c}`);
      return 2;
    }
    if (interrupted) {
      log("✗ compare --hot was interrupted.");
      return 130;
    }
    const verdict = compareHotRuns(done);
    for (const line of renderHotVerdict(verdict, done)) log(line);
    if (options.json) {
      const vitestNative = (() => {
        try {
          return JSON.parse(
            fs.readFileSync(
              path.join(root, "node_modules", "vitest-native", "package.json"),
              "utf8",
            ),
          ).version as string;
        } catch {
          return null;
        }
      })();
      fs.writeFileSync(
        path.resolve(options.json),
        JSON.stringify(
          {
            command: "compare --hot",
            versions: { vitest: vitest.version, vitestNative, node: process.version },
            runs: done.map((r) => ({
              label: r.label,
              mode: r.mode,
              wallMs: r.wallMs,
              seed: r.seed ?? null,
              untimed: !!r.untimed,
              unhandledErrors: r.unhandledErrors ?? 0,
              snapshots: r.snapshots ?? null,
              retried: r.retried?.size ?? 0,
              maxWorkers: r.untimed ? 2 : "config",
            })),
            verdict: { ...verdict, noDifference: verdict.noDifference },
          },
          null,
          1,
        ),
      );
    }
    return verdict.noDifference ? 0 : 1;
  } finally {
    for (const s of SIGNALS) process.off(s, onSignal);
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(configDir, { recursive: true, force: true });
    for (const [dir, existed] of [
      [configParent, hadConfigParent],
      [nodeModules, hadNodeModules],
    ] as const) {
      if (existed) continue;
      try {
        fs.rmdirSync(dir);
      } catch (error) {
        // Not empty (the project's own files) or already gone: left as it is.
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOTEMPTY" && code !== "EEXIST" && code !== "ENOENT") {
          log(`  Could not remove ${dir}, which compare created: ${(error as Error).message}`);
        }
      }
    }
    if (guardian?.connected) guardian.disconnect();
  }
}
