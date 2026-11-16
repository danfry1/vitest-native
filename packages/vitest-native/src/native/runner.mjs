// Hot-runtime test runner (wired as `test.runner` by the plugin when
// hotRuntime is on). One job: tell reset.mjs where a file's IMPORT phase ends.
//
// startTests (per file, because Vitest's worker loop calls it with one file at
// a time) runs: onBeforeCollect → collectTests (imports setup + the test module
// and, transitively, any resident externalized deps) → onBeforeRunFiles →
// tests. So onBeforeRunFiles is the exact boundary between import-phase state
// (resident-library lazy init — must be preserved across files, it never
// re-runs) and test-phase state (pollution the next file's reset removes).
// See reset.mjs for the full attribution model.
import { setTimeout as delay } from "node:timers/promises";
import { requireProjectContext } from "../context.mjs";
import { VitestNativeError } from "../errors.mjs";
import { describeProblems, residentProblems } from "./resident-health.mjs";
import NativeTestRunner from "./test-runner.mjs";

export default class NativeHotRunner extends NativeTestRunner {
  // Fires once per test file, before its setup files and its own modules are
  // imported — the point where Vitest resets the module graph when isolation is on.
  // The hot pool runs with isolation off so the worker survives, so the reset happens
  // here instead, through public API rather than by mutating Vitest's worker state.
  //
  // onBeforeCollect, not onCollectStart. Vitest AWAITS this one; it calls
  // onCollectStart without awaiting, and the worker wraps that hook in an async
  // function that first awaits an RPC to the main thread. The reset therefore landed
  // some indeterminate time after collection had already started — measured at ~0.2ms
  // against a 1-45ms head start on the setup-file import, so it always won in
  // practice, but nothing ordered it. Losing that race would have reset the graph
  // mid-import and dropped any mock a setup file had just registered.
  //
  // Vitest passes an array because the hook is shaped for a batch, but its per-file
  // loop invokes the run through startTests([file]) one file at a time, which is the
  // cadence the reset needs.
  //
  // A reset that throws must fail THIS file, not vanish it. Vitest calls the hook
  // outside the per-file try/catch that turns a collection error into a failed file,
  // so an error thrown from here rejects startTests, the file is never collected, and
  // it is missing from every report: Vitest records only a run-level "Test Run Error",
  // which the JSON reporter does not carry at all. The error is held and thrown from
  // the file's first import instead, which IS inside that try/catch, so the file is
  // reported failed with the restoration error naming the cause.
  async onBeforeCollect(paths) {
    const previousFile = this.vitestNativeFile;
    this.vitestNativeFile = paths[0];
    this.vitestNativeCauseReported = false;
    const previousFailed = this.vitestNativeFailedWithProblem === true;
    this.vitestNativeFailedWithProblem = false;
    const unusable = await this.residentUnusable(previousFile, previousFailed);
    try {
      globalThis.__vitest_native_reset_module_runner?.(paths[0]);
    } catch (error) {
      this.vitestNativeResetError = error;
    }
    // Held like a reset error so it fails this file by name (see above).
    this.vitestNativeResetError ??= unusable;
    return super.onBeforeCollect?.(paths);
  }

  // The resident packages must be usable before a file starts (resident-health.mjs).
  // Normally a worker that ended a file with a problem has already been retired by the
  // pool, so this finds none. It does when Vitest ran several files as one task, as it
  // does with one worker: the pool is consulted only between tasks. A problem that can
  // clear by itself (an act() scope still awaiting its callback) is waited for once per
  // task, up to the test timeout (5 s when it is off, 30 s at most). After that each
  // file checks again without waiting, and fails naming the cause while it persists,
  // instead of failing on renders that never commit.
  //
  // The message names the likely cause from how the leaving file ended. React closes an
  // async act() scope only when its result is awaited, and whether it was is private to
  // React, so the wait cannot be skipped for a scope that will never close. But a test
  // that awaits its act() ends with the scope closed, so a file that left it open with no
  // test failing while it was open started an act() it did not await. One where a test
  // failed with the scope open usually timed out inside an awaited act().
  async residentUnusable(previousFile, previousFailed = false) {
    const projectRoot = requireProjectContext().projectRoot;
    let problems = residentProblems(projectRoot);
    if (problems.length === 0) return null;
    if (this.vitestNativeLeftBy === undefined) {
      this.vitestNativeLeftBy = previousFile;
      this.vitestNativeLeftUnawaited = !previousFailed;
    }
    const timeout = this.config.testTimeout;
    const waitMs = Math.min(timeout > 0 ? timeout : 5_000, 30_000);
    if (!this.vitestNativeWaited) {
      this.vitestNativeWaited = true;
      // Counted in steps rather than read from Date, which fake timers the last file left
      // installed may have frozen; node:timers/promises is not replaced by them either.
      for (let step = 0; step < waitMs / 10; step++) {
        if (problems.length === 0 || !problems.every((p) => p.clearsOnItsOwn)) break;
        if (this.cancelRun) break;
        await delay(10);
        problems = residentProblems(projectRoot);
      }
      if (problems.length === 0) return null;
    }
    const leftBy = this.vitestNativeLeftBy ?? "an earlier file";
    const actScopeOnly = problems.every((problem) => problem.id === "react.act-scope");
    const cause =
      actScopeOnly && this.vitestNativeLeftUnawaited
        ? `No test in it failed while the scope was open, so an act() call in ${leftBy} ` +
          `was not awaited and React never closed its scope: await it (\`await act(...)\`, ` +
          `or the promise of an RNTL call that wraps act()).`
        : `Fix the test that left it open (often one in ${leftBy} that timed out or ` +
          `failed while awaiting act()).`;
    return new VitestNativeError(
      "HOT_RESIDENT_UNUSABLE",
      `hotRuntime: this worker cannot run this file: ${describeProblems(problems)} since ` +
        `${leftBy} ended, and it did not close within ${waitMs} ms. ${cause} Renders would ` +
        `queue inside it and never commit. Vitest runs every file of a one-worker run as ` +
        `one task, so the worker cannot be replaced between files; with maxWorkers >= 2 ` +
        `the hot runtime retires it instead.`,
    );
  }

  // A failed test that leaves resident state unusable gets the cause beside its own
  // error, once per file: the timeout alone does not say why later files would have
  // failed, nor that the worker is retired. A passing test that leaves it is not failed
  // here, as it would pass under per-file isolation; the pool still retires the worker.
  // The entry carries no stack: it would point into this file, not the test.
  async onAfterRunTask(test) {
    if (test.result?.state === "fail" && !this.vitestNativeCauseReported) {
      const problems = residentProblems(requireProjectContext().projectRoot);
      if (problems.length > 0) {
        this.vitestNativeCauseReported = true;
        this.vitestNativeFailedWithProblem = true;
        const message =
          `[vitest-native] hotRuntime: ${describeProblems(problems)} after this test failed, ` +
          `often because a test timed out while awaiting act(). React stays loaded across ` +
          `files, so later renders on this worker would queue inside that scope and never ` +
          `commit. The hot runtime retires the worker after this file (with one worker, ` +
          `where it cannot, the later files fail naming this cause).`;
        (test.result.errors ??= []).push({
          name: "VitestNativeError",
          message,
          stack: `VitestNativeError: ${message}`,
        });
      }
    }
    return super.onAfterRunTask?.(test);
  }

  importFile(filepath, source) {
    const resetError = this.vitestNativeResetError;
    if (resetError) {
      this.vitestNativeResetError = undefined;
      throw resetError;
    }
    // Set by worker.mjs only while it reports files a rejected task never reached.
    const lostFileError = globalThis.__vitest_native_lost_file_error;
    if (lostFileError) throw lostFileError(this.vitestNativeFile ?? filepath);
    return super.importFile(filepath, source);
  }

  // Every file that reaches this hook is reported to the main thread. The worker
  // entry compares this against the files it was asked to run (worker.mjs).
  async onCollected(files) {
    for (const file of files) globalThis.__vitest_native_file_collected?.(file.filepath);
    return super.onCollected?.(files);
  }

  async onBeforeRunFiles(files) {
    globalThis.__vitest_native_hot_bless?.();
    return super.onBeforeRunFiles?.(files);
  }
}
