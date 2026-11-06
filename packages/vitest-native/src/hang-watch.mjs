// `hangTimeout`: fail a run whose tests stop making progress, naming what was running.
//
// Vitest's `testTimeout` and `hookTimeout` are timers on the test's own worker. A test
// stuck in synchronous code (a `while` loop that never ends, a wrapper that re-enters the
// collection it is iterating) never yields to that worker's event loop, so those timers
// never fire, and the run waits forever with nothing on screen. The worker's thread or
// process is the only thing stuck: Vitest's main process, where reporters run, stays
// responsive. This reporter, added by the plugin, notices that no test or file has
// started or finished for `hangTimeout` milliseconds while a run is in progress, prints
// the files and tests that were running, and ends the process with exit code 1.
//
// A stuck worker cannot be stopped politely (Vitest would wait for it), so v1 fails the
// whole run rather than only that file, killing this process's descendants on the way
// out: a forked worker (Vitest's default pool) would otherwise spin on after the run.

import { spawnSync } from "node:child_process";
import fs from "node:fs";

/** The default no-progress limit when `hangTimeout` is not set. */
export const DEFAULT_HANG_TIMEOUT = 60_000;

/**
 * The limit to use: the option if set, otherwise the larger of the default and twice the
 * longest per-test or per-hook timeout, so a project that allows slow tests is not cut
 * short. `false` and 0 turn the watch off (null).
 */
export function hangTimeoutFor(option, { testTimeout = 5000, hookTimeout = 10000 } = {}) {
  if (option === false || option === 0) return null;
  if (typeof option === "number") return option;
  return Math.max(DEFAULT_HANG_TIMEOUT, 2 * Math.max(testTimeout, hookTimeout));
}

/**
 * Whether a debugger is (or will be) attached: a test paused at a breakpoint makes no
 * progress either, and must not be failed for it.
 */
export function debugging(config = {}, execArgv = process.execArgv, inspectorUrl) {
  if (config.inspect || config.inspectBrk) return true;
  if (execArgv.some((arg) => /^--inspect(-brk|-wait)?(=|$)/.test(arg))) return true;
  return Boolean(inspectorUrl);
}

/** Every live descendant of `pid` (children first found, deepest last). */
export function descendantsOf(pid) {
  const children = (parent) => {
    const out = spawnSync("pgrep", ["-P", String(parent)], { encoding: "utf8" });
    if (!out.error && (out.status === 0 || out.status === 1)) {
      return out.stdout.split("\n").filter(Boolean).map(Number);
    }
    // No pgrep: read parent ids from /proc (Linux).
    try {
      return fs
        .readdirSync("/proc")
        .filter((d) => /^\d+$/.test(d))
        .filter((d) => {
          try {
            const stat = fs.readFileSync(`/proc/${d}/stat`, "utf8");
            return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]) === parent;
          } catch {
            return false;
          }
        })
        .map(Number);
    } catch {
      return [];
    }
  };
  const found = [];
  const queue = [pid];
  while (queue.length > 0) {
    for (const child of children(queue.shift())) {
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

/**
 * Stop every process this one started, then exit with `code`. A forked test worker stuck
 * in a loop does not end with its parent: left alone it spins forever.
 */
export function exitKillingDescendants(code) {
  if (process.platform === "win32") {
    // Ends this process too, with its whole tree.
    process.exitCode = code;
    spawnSync("taskkill", ["/F", "/T", "/PID", String(process.pid)], {
      stdio: "ignore",
      windowsHide: true,
    });
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
    write = (s) => process.stderr.write(s),
  }) {
    this.timeoutMs = timeoutMs;
    this.exit = exit;
    this.write = write;
    /** Test file → the test running in it, or null between tests. */
    this.running = new Map();
    this.active = false;
    this.timer = undefined;
  }

  onTestRunStart() {
    this.active = true;
    this.running.clear();
    this.progress();
  }

  onTestModuleStart(testModule) {
    this.running.set(testModule.moduleId, null);
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
    this.active = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  progress() {
    if (!this.active) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.trip(), this.timeoutMs);
    this.timer.unref?.();
  }

  /**
   * The message: what was running, and how to change the limit. A worker reports a test's
   * start asynchronously, so one stuck in synchronous code may be known by file only.
   */
  report() {
    const seconds = Math.round(this.timeoutMs / 1000);
    const lines = [
      `[vitest-native] No test made progress for ${seconds} s (hangTimeout): a test or hook is stuck in synchronous code, which testTimeout cannot interrupt.`,
    ];
    if (this.running.size === 0) {
      lines.push(
        "  No test file was running: the stall is while a worker starts or a file is collected.",
      );
    }
    for (const [file, test] of this.running) {
      lines.push(
        test
          ? `  Running: ${file} › ${test}`
          : `  Running: ${file} (no test reported as running: a test whose start was not reported yet, a hook, or the file's imports)`,
      );
    }
    lines.push(
      "  The run is stopped. If a test legitimately runs this long with no other test finishing, raise reactNative({ hangTimeout }) or set it to false.",
    );
    return lines;
  }

  trip() {
    this.write(`${this.report().join("\n")}\n`);
    this.exit(1);
  }
}
