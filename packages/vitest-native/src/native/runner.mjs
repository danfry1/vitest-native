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
// vitest >=4.1 exports TestRunner from the main entry; 4.0.x only exposes it as
// VitestTestRunner via the "vitest/runners" subpath, which vitest 5 REMOVED.
// Prefer the main entry, and reach for the old subpath only when the main export
// is absent.
//
// The fallback specifier is computed rather than written literally, because a
// literal is resolved when this module is TRANSFORMED, not when the branch runs.
// Against vitest 5 that resolution fails ("./runners" is not exported), and the
// failure is silent in the worst way: the run reports unhandled errors, executes
// no tests, and still exits 0. A computed specifier keeps the branch invisible to
// the resolver, so 4.0.x keeps its fallback and 5 never looks for it.
import { setTimeout as delay } from "node:timers/promises";
import * as vitest from "vitest";
import { requireProjectContext } from "../context.mjs";
import { VitestNativeError } from "../errors.mjs";
import { describeProblems, residentProblems } from "./resident-health.mjs";

let TestRunner = vitest.TestRunner;
if (!TestRunner) {
  const legacyRunners = ["vitest", "runners"].join("/");
  ({ VitestTestRunner: TestRunner } = await import(/* @vite-ignore */ legacyRunners));
}

export default class NativeHotRunner extends TestRunner {
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
    const unusable = await this.residentUnusable(previousFile);
    try {
      globalThis.__vitest_native_reset_module_runner?.();
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
  async residentUnusable(previousFile) {
    const projectRoot = requireProjectContext().projectRoot;
    let problems = residentProblems(projectRoot);
    if (problems.length === 0) return null;
    this.vitestNativeLeftBy ??= previousFile;
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
    return new VitestNativeError(
      "HOT_RESIDENT_UNUSABLE",
      `hotRuntime: this worker cannot run this file: ${describeProblems(problems)} since ` +
        `${this.vitestNativeLeftBy ?? "an earlier file"} ended, and it did not close within ` +
        `${waitMs} ms. Renders would queue inside it and never commit. Vitest runs every ` +
        `file of a one-worker run as one task, so the worker cannot be replaced between ` +
        `files. Fix the test that left it open (often one that timed out while awaiting ` +
        `act()), or run with maxWorkers >= 2 so the hot runtime can retire the worker.`,
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
