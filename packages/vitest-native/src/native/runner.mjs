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
// vitest >=4.1 exports TestRunner from the main entry; <4.1 only exposes it as
// VitestTestRunner via the (now-deprecated) "vitest/runners" subpath. Prefer the
// main entry so 4.1+ doesn't print a deprecation warning, and fall back for
// 4.0.x — the deprecated path is imported ONLY when the main export is absent,
// so 4.1+ never triggers the warning. A namespace import (not a named one) keeps
// a missing export as `undefined` instead of an ESM link error on 4.0.x.
import * as vitest from "vitest";

let TestRunner = vitest.TestRunner;
if (!TestRunner) {
  ({ VitestTestRunner: TestRunner } = await import("vitest/runners"));
}

export default class NativeHotRunner extends TestRunner {
  async onBeforeRunFiles(files) {
    globalThis.__vitest_native_hot_bless?.();
    return super.onBeforeRunFiles?.(files);
  }
}
