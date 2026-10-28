// The bug museum's second witness to a run (accounting.mjs; copied from the config-axis matrix harness, feat/config-axis-matrix). Vitest's
// JSON reporter keeps per-file results only: an unhandled error, and a file the run was
// given but never collected, leave no trace in it (#350 lost a third of a suite that
// way). This reporter writes what onTestRunEnd sees: every test module with its state,
// the run's unhandled errors, and why the run ended. The harness sets
// MUSEUM_ACCOUNTING_FILE; without it the reporter does nothing.
import fs from "node:fs";

// An error as a reporter sees it, flattened to one line so the harness can sign on it:
// the whole message (a restoration failure names the failed restore on its later lines)
// and the cause chain, which the JSON report drops ("[vitest] There was an error when
// mocking a module" is generic; its cause says which module and why).
const flat = (text) =>
  String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" / ")
    .slice(0, 1000);

function describe(error) {
  const causes = [];
  let cause = error?.cause;
  for (let depth = 0; cause && depth < 5; depth++) {
    causes.push(`${cause.name ?? "Error"}: ${flat(cause.message ?? cause)}`);
    cause = cause.cause;
  }
  return { name: error?.name ?? "Error", message: flat(error?.message), causes };
}

function attempt(read, fallback) {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function failedTests(module) {
  const failed = [];
  for (const test of attempt(() => [...module.children.allTests()], [])) {
    const result = attempt(() => test.result(), null);
    if (result?.state === "failed")
      failed.push({ name: test.name, errors: (result.errors ?? []).map(describe) });
  }
  return failed;
}

export default class AccountingReporter {
  onTestRunEnd(testModules, unhandledErrors, reason) {
    const file = process.env.MUSEUM_ACCOUNTING_FILE;
    if (!file) return;
    const modules = testModules.map((module) => ({
      file: module.moduleId,
      state: attempt(() => module.state(), "unknown"),
      errors: attempt(() => module.errors().map(describe), []),
      failedTests: failedTests(module),
    }));
    const errors = unhandledErrors.map((error) => ({
      ...describe(error),
      testPath: error?.VITEST_TEST_PATH ?? null,
    }));
    fs.writeFileSync(file, `${JSON.stringify({ reason, modules, unhandledErrors: errors })}\n`);
  }
}
