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
import { VitestTestRunner } from "vitest/runners";

export default class NativeHotRunner extends VitestTestRunner {
  async onBeforeRunFiles(files) {
    globalThis.__vitest_native_hot_bless?.();
    return super.onBeforeRunFiles?.(files);
  }
}
