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
  async onBeforeRunFiles(files) {
    globalThis.__vitest_native_hot_bless?.();
    return super.onBeforeRunFiles?.(files);
  }
}
