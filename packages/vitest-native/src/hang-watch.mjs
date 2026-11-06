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
// whole run rather than only that file.

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

export class HangWatch {
  constructor({
    timeoutMs,
    exit = (code) => process.exit(code),
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

  /** The message: what was running, and how to change the limit. */
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
          : `  Running: ${file} (between tests: a hook, the file's imports or setup)`,
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
