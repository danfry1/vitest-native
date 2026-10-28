// The config-axis harness's second witness to a run (../../../accounting.mjs). Vitest's
// JSON reporter keeps per-file results only: an unhandled error, and a file the run was
// given but never collected, leave no trace in it (#350 lost a third of a suite that
// way). This reporter writes what onTestRunEnd sees: every test module with its state,
// the run's unhandled errors, and why the run ended. The harness sets
// AXIS_ACCOUNTING_FILE; without it the reporter does nothing.
import fs from "node:fs";

const firstLine = (text) => String(text ?? "").split("\n")[0];

function attempt(read, fallback) {
  try {
    return read();
  } catch {
    return fallback;
  }
}

export default class AccountingReporter {
  onTestRunEnd(testModules, unhandledErrors, reason) {
    const file = process.env.AXIS_ACCOUNTING_FILE;
    if (!file) return;
    const modules = testModules.map((module) => ({
      file: module.moduleId,
      state: attempt(() => module.state(), "unknown"),
      errors: attempt(() => module.errors().map((error) => firstLine(error.message)), []),
    }));
    const errors = unhandledErrors.map((error) => ({
      name: error?.name ?? "Error",
      message: firstLine(error?.message),
      testPath: error?.VITEST_TEST_PATH ?? null,
    }));
    fs.writeFileSync(file, `${JSON.stringify({ reason, modules, unhandledErrors: errors })}\n`);
  }
}
