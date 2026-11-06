// A Vitest reporter that fails a run which stops making progress, and says what was
// running when it stopped.
//
// A test worker stuck in a synchronous loop never reaches Vitest's own timeouts: they
// run on that worker's event loop. The main process stays responsive (the worker is a
// thread or a child process of it), so this reporter, which runs there, can still see
// that nothing has started or finished for a while. Without it the run waits for the CI
// job's timeout and prints nothing about where it hung.
//
// VN_HANG_IDLE_MS     no-progress limit, default 5 minutes. Any file starting or ending,
//                     or any test starting or finishing, is progress.
// VN_PROGRESS_LOG     optional: every event is appended here as a JSON line, written
//                     synchronously, so a deadline outside this process can still say
//                     what was running if the main process itself is stuck
//                     (scripts/ci/deadline.mjs).
//
// Added by scripts/ci/vitest.mjs when VN_HANG_GUARD=1.
import fs from "node:fs";

const DEFAULT_IDLE_MS = 5 * 60_000;

export default class HangReporter {
  constructor({
    idleMs = Number(process.env.VN_HANG_IDLE_MS) || DEFAULT_IDLE_MS,
    log = process.env.VN_PROGRESS_LOG,
    exit = (code) => process.exit(code),
  } = {}) {
    this.idleMs = idleMs;
    this.log = log;
    this.exit = exit;
    /** Test file → the test running in it, or null between tests. */
    this.running = new Map();
    this.timer = undefined;
  }

  onInit() {
    this.event({ event: "init" });
  }

  onTestModuleStart(testModule) {
    this.running.set(testModule.moduleId, null);
    this.event({ event: "file-start", file: testModule.moduleId });
  }

  onTestCaseReady(testCase) {
    this.running.set(testCase.module.moduleId, testCase.fullName);
    this.event({ event: "test-start", file: testCase.module.moduleId, test: testCase.fullName });
  }

  onTestCaseResult(testCase) {
    if (this.running.get(testCase.module.moduleId) === testCase.fullName) {
      this.running.set(testCase.module.moduleId, null);
    }
    this.event({ event: "test-end", file: testCase.module.moduleId, test: testCase.fullName });
  }

  onTestModuleEnd(testModule) {
    this.running.delete(testModule.moduleId);
    this.event({ event: "file-end", file: testModule.moduleId });
  }

  onTestRunEnd() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.append({ event: "run-end" });
  }

  event(entry) {
    this.append(entry);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.trip(), this.idleMs);
    // Never the reason the process stays alive: a run that finished exits as before.
    this.timer.unref?.();
  }

  append(entry) {
    if (!this.log) return;
    try {
      fs.appendFileSync(this.log, `${JSON.stringify({ at: Date.now(), ...entry })}\n`);
    } catch {
      // The log only helps a deadline outside this process; the guard works without it.
    }
  }

  /**
   * The lines naming what is still running. A worker reports a test's start in batches,
   * asynchronously, so a worker stuck in synchronous code may never report the test it is
   * in: then only the file is known.
   */
  report() {
    const minutes = (this.idleMs / 60_000).toFixed(1).replace(/\.0$/, "");
    const lines = [`No test progress for ${minutes} min.`];
    if (this.running.size === 0) {
      lines.push(
        "No test file was running: the hang is before or between files (global setup, collection, or a worker that never started).",
      );
    }
    for (const [file, test] of this.running) {
      lines.push(
        test
          ? `Running: ${file} (test "${test}")`
          : `Running: ${file} (no test reported as running: a test whose start was not reported yet, a hook, or the file's imports)`,
      );
    }
    return lines;
  }

  trip() {
    const lines = this.report();
    this.append({ event: "hang", running: [...this.running] });
    const github = process.env.GITHUB_ACTIONS === "true";
    for (const line of lines) process.stderr.write(`${github ? "::error::" : "✗ "}${line}\n`);
    // A stuck worker cannot be closed politely: Vitest would wait for it. Exiting ends
    // its threads; a forked worker is left to the deadline's process-group kill.
    this.exit(1);
  }
}
