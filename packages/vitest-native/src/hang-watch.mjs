// `hangTimeout`: fail a run whose tests stop making progress, naming what was running.
//
// Vitest's `testTimeout` and `hookTimeout` are timers on the test's own worker. A test
// stuck in synchronous code (a `while` loop that never ends, a wrapper that re-enters the
// collection it is iterating) never yields to that worker's event loop, so those timers
// never fire, and the run waits forever with nothing on screen. The worker's thread or
// process is the only thing stuck: Vitest's main process, where reporters run, stays
// responsive. This reporter, added by the plugin, notices that while test files are in
// flight, none has been queued, started or finished, and no test has started or finished,
// for `hangTimeout` milliseconds. It then prints the files and tests that were running and
// ends the process with exit code 1.
//
// It watches only while files are in flight: from a worker taking a file to the last file
// ending. Global setup, coverage, and typecheck mode's compiler run send no test events and
// are outside that window, so a long one is not mistaken for a hang.
//
// A stuck worker cannot be stopped politely (Vitest would wait for it), so v1 fails the
// whole run rather than only that file, and kills this process's descendants on the way
// out: a forked worker (Vitest's default pool) would otherwise spin on after the run.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** The default no-progress limit when `hangTimeout` is not set. */
export const DEFAULT_HANG_TIMEOUT = 60_000;
/** Node's longest timer: a longer delay fires after 1 ms instead. */
export const MAX_HANG_TIMEOUT = 2_147_483_647;

/**
 * The limit to use: the option if set, otherwise the larger of the default and twice the
 * longest per-test or per-hook timeout, so a project that allows slow tests is not cut
 * short. Null (the watch off) for `false` or 0, and when that limit is not a finite timer
 * delay: `testTimeout: Infinity` means "never time out", and so does the watch.
 */
export function hangTimeoutFor(option, { testTimeout = 5000, hookTimeout = 10000 } = {}) {
  if (option === false || option === 0) return null;
  const limit =
    typeof option === "number"
      ? option
      : Math.max(DEFAULT_HANG_TIMEOUT, 2 * Math.max(testTimeout ?? 0, hookTimeout ?? 0));
  return Number.isFinite(limit) && limit > 0 && limit <= MAX_HANG_TIMEOUT ? limit : null;
}

const INSPECT_FLAG = /^--inspect(-brk|-wait)?(=|$)/;

/**
 * Whether a debugger is (or will be) attached: a test paused at a breakpoint makes no
 * progress either, and must not be failed for it. Checks Vitest's inspect options and the
 * flags it passes to workers (`execArgv`) in each config, this process's flags, and an
 * open inspector.
 */
export function debugging(configs = [], execArgv = process.execArgv, inspectorUrl) {
  for (const config of configs) {
    if (!config) continue;
    if (config.inspect || config.inspectBrk) return true;
    if ((config.execArgv ?? []).some((arg) => INSPECT_FLAG.test(arg))) return true;
  }
  if (execArgv.some((arg) => INSPECT_FLAG.test(arg))) return true;
  return Boolean(inspectorUrl);
}

/** The direct children of `pid`. */
function childrenOf(pid) {
  if (process.platform === "win32") {
    const out = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}').ProcessId`,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    return out.error ? [] : out.stdout.split(/\s+/).filter(Boolean).map(Number);
  }
  const out = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
  if (!out.error && (out.status === 0 || out.status === 1)) {
    return out.stdout.split("\n").filter(Boolean).map(Number);
  }
  // No pgrep: read parent ids from /proc (Linux).
  try {
    return fs
      .readdirSync("/proc")
      .filter((entry) => /^\d+$/.test(entry))
      .filter((entry) => {
        try {
          const stat = fs.readFileSync(`/proc/${entry}/stat`, "utf8");
          return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]) === pid;
        } catch {
          return false;
        }
      })
      .map(Number);
  } catch {
    return [];
  }
}

/** Every live descendant of `pid`. */
export function descendantsOf(pid) {
  const found = [];
  const queue = [pid];
  while (queue.length > 0) {
    for (const child of childrenOf(queue.shift())) {
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

/**
 * Stop every process this one started, then exit with `code`. A forked test worker stuck
 * in a loop does not end with its parent: left alone it spins forever. On Windows each
 * child's tree goes through taskkill and this process then exits normally, so its exit
 * handlers (the terminal renderer's flush among them) still run.
 */
export function exitKillingDescendants(code) {
  if (process.platform === "win32") {
    for (const pid of childrenOf(process.pid)) {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        windowsHide: true,
      });
    }
  } else {
    for (const pid of descendantsOf(process.pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        // ESRCH: it exited on its own meanwhile. Anything else is worth knowing about.
        if (error?.code !== "ESRCH")
          fs.writeSync(2, `[vitest-native] could not stop process ${pid}: ${error}\n`);
      }
    }
  }
  process.exit(code);
}

/** How long a recorded test may legitimately run: its timeout, plus its hooks and slack. */
export function testBudget(record) {
  return (record.timeout ?? 5000) + 2 * (record.hookTimeout ?? 10000) + 1000;
}

/** The latest record per test file, from the workers' files in `dir` (hang-watch-setup.mjs). */
export function readTestRecords(dir) {
  const byFile = new Map();
  // Created by the main process before any worker starts (plugin.ts, watchForHangs).
  if (!dir || !fs.existsSync(dir)) return byFile;
  /** Records caught mid-write: the next check reads them whole. */
  const unreadable = [];
  for (const entry of fs.readdirSync(dir)) {
    let record;
    try {
      record = JSON.parse(fs.readFileSync(path.join(dir, entry), "utf8"));
    } catch (error) {
      unreadable.push({ entry, error });
      continue;
    }
    if (!record?.file) continue;
    const seen = byFile.get(record.file);
    if (!seen || seen.at < record.at) byFile.set(record.file, record);
  }
  byFile.unreadable = unreadable;
  return byFile;
}

/** Whether this process is Vitest's own CLI, which may be ended, rather than a host using its API. */
export function runByCli(argv = process.argv) {
  return /(^|[\\/])vitest(\.m?js)?$/.test(argv[1] ?? "");
}

export class HangWatch {
  constructor({
    timeoutMs,
    recordsDir,
    exit = exitKillingDescendants,
    // Straight to the file descriptor: Vitest's terminal renderer buffers writes to
    // process.stderr, and the process may end right after this.
    write = (text) => fs.writeSync(2, text),
    now = () => Date.now(),
    cli = runByCli(),
    graceMs = 5000,
  }) {
    this.timeoutMs = timeoutMs ?? null;
    this.recordsDir = recordsDir;
    /** On only if some project turned it on and none turned it off (contribute). */
    this.active = timeoutMs !== undefined && timeoutMs !== null;
    this.off = false;
    this.exit = exit;
    this.write = write;
    this.now = now;
    this.cli = cli;
    this.graceMs = graceMs;
    /** Test file → the test running in it, or null if none has reported starting. */
    this.running = new Map();
    /** Test file → when a worker took it (onTestModuleQueued). */
    this.takenAt = new Map();
    /**
     * The last module the main process transformed for a worker (activity). A file still
     * importing makes no reporter event until its first test, so a cold start (a worker
     * booting, a large graph transforming for the first time) looks like a hang to the
     * events alone. A module load is progress: a file stuck in a synchronous loop loads
     * none.
     */
    this.lastActivity = 0;
    this.timer = undefined;
    this.vitest = undefined;
  }

  onInit(vitest) {
    this.vitest = vitest;
  }

  /**
   * One project's say for this run, from each project's plugin:
   * - `off` (`hangTimeout: false`) turns the watch off for the whole run;
   * - `active` (a limit was set, or the project runs on the hot runtime) turns it on;
   * - the longest limit wins, so no project is cut shorter than it asked.
   */
  contribute({ off = false, active = false, limit = null } = {}) {
    if (off) this.off = true;
    if (active) this.active = true;
    if (limit !== null) this.timeoutMs = Math.max(this.timeoutMs ?? 0, limit);
  }

  /** Whether this run is watched at all. */
  watching() {
    return this.active && !this.off && this.timeoutMs !== null;
  }

  onTestRunStart() {
    this.running.clear();
    this.takenAt.clear();
    this.disarm();
  }

  /** Called by the plugin for each module the main process transforms (see lastActivity). */
  activity() {
    this.lastActivity = this.now();
  }

  onTestModuleQueued(testModule) {
    // A worker took the file (Vitest queues a file only when a worker is free for it): its
    // imports and collection are in flight from here.
    this.taken(testModule.moduleId);
    this.progress();
  }

  onTestModuleStart(testModule) {
    this.taken(testModule.moduleId);
    this.progress();
  }

  taken(file) {
    if (!this.running.has(file)) this.running.set(file, null);
    if (!this.takenAt.has(file)) this.takenAt.set(file, this.now());
  }

  onTestCaseReady(testCase) {
    this.running.set(testCase.module.moduleId, testCase.fullName);
    this.progress();
  }

  onTestCaseResult(testCase) {
    if (this.running.get(testCase.module.moduleId) === testCase.fullName) {
      this.running.set(testCase.module.moduleId, null);
    }
    this.progress();
  }

  onTestModuleEnd(testModule) {
    this.running.delete(testModule.moduleId);
    this.takenAt.delete(testModule.moduleId);
    this.progress();
  }

  onTestRunEnd() {
    // Watch mode waits here for the next change: that is not a hang.
    this.running.clear();
    this.takenAt.clear();
    this.disarm();
  }

  /** Restart the limit while any file is in flight; otherwise stop watching. */
  progress() {
    this.disarm();
    if (!this.watching() || this.running.size === 0) return;
    this.arm(this.timeoutMs);
  }

  arm(ms) {
    this.disarm();
    this.timer = setTimeout(() => this.check(), ms);
    this.timer.unref?.();
  }

  /**
   * The limit passed with no progress. A test still inside its own budget (its timeout,
   * retries counted per attempt, plus its hooks) or paused in a debugger is waited for,
   * until that budget runs out; otherwise the run is stuck.
   */
  check() {
    const records = readTestRecords(this.recordsDir);
    let waitUntil = 0;
    for (const file of this.running.keys()) {
      const record = records.get(file);
      if (!record) continue;
      if (record.debugger) return this.arm(this.timeoutMs);
      waitUntil = Math.max(waitUntil, record.at + testBudget(record));
    }
    // Modules still loading somewhere in the run: progress the events cannot show.
    if (this.lastActivity > 0) waitUntil = Math.max(waitUntil, this.lastActivity + this.timeoutMs);
    const left = waitUntil - this.now();
    if (left > 0) return this.arm(left);
    this.trip(records);
  }

  disarm() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** The message: what was running, and what to do. */
  report(records = new Map()) {
    const seconds = Math.round(this.timeoutMs / 1000);
    const lines = [
      `[vitest-native] No test made progress for ${seconds} s (hangTimeout), and the running tests are past their own timeouts: a test or hook is stuck in synchronous code, which testTimeout cannot interrupt.`,
    ];
    const now = this.now();
    const ago = (at) => `${Math.round((now - at) / 1000)} s ago`;
    for (const [file, reported] of this.running) {
      const record = records.get(file);
      const test = record?.test ?? reported;
      const taken = this.takenAt.get(file);
      lines.push(
        test
          ? `  Running: ${file} › ${test}${record?.at ? ` (started ${ago(record.at)})` : ""}`
          : `  Running: ${file} (no test had started; a worker took the file ${taken ? ago(taken) : "earlier"}: its imports, collection or a beforeAll hook. On a hot worker, the first file includes the worker's start-up)`,
      );
    }
    lines.push(
      this.lastActivity > 0
        ? `  The last module the run loaded was ${ago(this.lastActivity)}.`
        : "  No module was loaded through Vite in this run.",
    );
    lines.push(
      "  The run is stopped (global teardown and output reporters such as coverage and junit do not finish). To change the limit, set reactNative({ hangTimeout }); false turns it off.",
    );
    return lines;
  }

  async trip(records = new Map()) {
    const lines = this.report(records);
    this.write(`${lines.join("\n")}\n`);
    if (process.env.GITHUB_ACTIONS === "true") {
      const where = [...this.running].map(
        ([file, t]) =>
          `${file}${(records.get(file)?.test ?? t) ? ` › ${records.get(file)?.test ?? t}` : ""}`,
      );
      this.write(`::error title=hangTimeout::No test progress; stopped. ${where.join("; ")}\n`);
    }
    process.exitCode = 1;
    // Ask Vitest to close first (it stops its workers and runs what teardown it can),
    // but not for longer than the grace period: a stuck worker can hold close() forever.
    const closed = this.vitest?.close?.();
    if (closed) {
      await Promise.race([
        closed.catch((error) =>
          this.write(`[vitest-native] closing Vitest after the hang failed: ${error}\n`),
        ),
        new Promise((r) => setTimeout(r, this.graceMs).unref?.()),
      ]);
    }
    // A host using Vitest's API keeps its process; only Vitest's own CLI is ended.
    if (this.cli) this.exit(1);
  }
}
