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
import * as vitest from "vitest";

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
  async onBeforeCollect(paths) {
    globalThis.__vitest_native_reset_module_runner?.();
    return super.onBeforeCollect?.(paths);
  }

  async onBeforeRunFiles(files) {
    globalThis.__vitest_native_hot_bless?.();
    return super.onBeforeRunFiles?.(files);
  }
}
