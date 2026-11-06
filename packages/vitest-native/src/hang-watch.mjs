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
      } catch {}
    }
  }
  process.exit(code);
}

export class HangWatch {
  constructor({
    timeoutMs,
    exit = exitKillingDescendants,
    // Straight to the file descriptor: Vitest's terminal renderer buffers writes to
    // process.stderr, and the process ends right after this.
    write = (text) => fs.writeSync(2, text),
  }) {
    /** Null: off (a project set `hangTimeout: false`). */
    this.timeoutMs = timeoutMs;
    this.exit = exit;
    this.write = write;
    /** Test file → the test running in it, or null if none has reported starting. */
    this.running = new Map();
    this.timer = undefined;
  }

  /**
   * Another project's limit for the same run: `false` anywhere turns the watch off,
   * otherwise the longest limit wins, so no project is cut shorter than it asked.
   */
  merge(timeoutMs) {
    if (this.timeoutMs === null || timeoutMs === null) this.timeoutMs = null;
    else this.timeoutMs = Math.max(this.timeoutMs, timeoutMs);
  }

  onTestRunStart() {
    this.running.clear();
    this.disarm();
  }

  onTestModuleQueued(testModule) {
    // A worker took the file: its imports and collection are in flight from here.
    if (!this.running.has(testModule.moduleId)) this.running.set(testModule.moduleId, null);
    this.progress();
  }

  onTestModuleStart(testModule) {
    if (!this.running.has(testModule.moduleId)) this.running.set(testModule.moduleId, null);
    this.progress();
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
    this.progress();
  }

  onTestRunEnd() {
    // Watch mode waits here for the next change: that is not a hang.
    this.running.clear();
    this.disarm();
  }

  /** Restart the limit while any file is in flight; otherwise stop watching. */
  progress() {
    this.disarm();
    if (this.timeoutMs === null || this.running.size === 0) return;
    this.timer = setTimeout(() => this.trip(), this.timeoutMs);
    this.timer.unref?.();
  }

  disarm() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** The message: what was running, and what to do. */
  report() {
    const seconds = Math.round(this.timeoutMs / 1000);
    const lines = [
      `[vitest-native] No test made progress for ${seconds} s (hangTimeout). A test or hook is probably stuck in synchronous code, which testTimeout cannot interrupt.`,
    ];
    for (const [file, test] of this.running) {
      lines.push(
        test
          ? `  Running: ${file} › ${test}`
          : `  Running: ${file} (no test reported as running: a test whose start was not reported yet, a hook, or the file's imports)`,
      );
    }
    lines.push(
      "  The run is stopped. If a test legitimately runs this long while no other test finishes, raise reactNative({ hangTimeout }) or set it to false.",
    );
    return lines;
  }

  trip() {
    this.write(`${this.report().join("\n")}\n`);
    this.exit(1);
  }
}
