// What one Vitest process of the config-axis matrix did, from three witnesses that do not
// depend on each other: the process (exit code, signal, timeout), Vitest's JSON report
// (per-file results), and the accounting reporter (fixture/apps/app/accounting-reporter.mjs:
// the modules Vitest collected and the run's unhandled errors, which the JSON report
// drops). run.mjs turns the result into verdicts.
//
// The run-level checks hold in every run, whatever the probes did. A run whose probes
// fail as known-failing.json expects can still carry an unhandled error, a crash or a
// file that produced no result, and each of those is reported on its own line. (Before,
// an unexplained exit was reported only when every probe passed, so a cell with any known
// failure hid it.)
import fs from "node:fs";
import path from "node:path";

const firstLine = (text) => String(text ?? "").split("\n")[0];

function readJson(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const causedBy = (errors) => {
  const causes = (errors ?? []).flatMap((error) => error.causes ?? []);
  return causes.length > 0 ? ` (caused by: ${causes.join(" <- ")})` : "";
};

/**
 * Per-file results from Vitest's JSON report: { basename: { ok, failures: string[] } }.
 * `failures` holds one line per failed assertion (or the file's own error), each prefixed
 * with the file, so a known-failing entry's signature is matched against every one of them.
 * The JSON report keeps only an error's message, so each line also carries the error's
 * cause chain from the accounting record, when it has one.
 */
export function fileResults(report, accounting = null) {
  if (!report) return null;
  const modules = new Map(
    (accounting?.modules ?? []).map((module) => [path.basename(module.file), module]),
  );
  const results = {};
  for (const file of report.testResults ?? []) {
    const name = path.basename(file.name);
    const module = modules.get(name);
    const assertions = file.assertionResults ?? [];
    const failed = assertions.filter((a) => a.status !== "passed");
    // A file with no passing assertion proves nothing, whatever its status says.
    const ok = file.status === "passed" && assertions.length > 0 && failed.length === 0;
    const failures = failed.map((a) => {
      const test = module?.failedTests?.find((t) => t.name === a.title);
      return `${name}: ${a.title}: ${firstLine((a.failureMessages ?? []).join(" "))}${causedBy(test?.errors)}`;
    });
    if (failures.length === 0 && !ok) {
      failures.push(
        `${name}: ${firstLine(file.message) || (assertions.length === 0 ? "no tests ran" : file.status)}${causedBy(module?.errors)}`,
      );
    }
    results[name] = { ok, failures };
  }
  return results;
}

/**
 * The run-level problems of one Vitest process, as lines. `expected` is the basenames of
 * the files it was given. Empty when the process, the JSON report and the accounting
 * reporter agree with each other and with `expected`.
 *
 *   proc        { status, signal, timedOut }
 *   report      the parsed JSON report, or null
 *   accounting  the parsed accounting file, or null
 */
export function runProblems(proc, expected, report, accounting) {
  const problems = [];
  if (proc.timedOut) problems.push("the run timed out");
  if (proc.signal) problems.push(`the process was killed by ${proc.signal}`);
  else if (proc.status !== 0 && proc.status !== 1)
    problems.push(`the process exited ${proc.status} (Vitest exits 0 or 1)`);
  if (!report) problems.push("no JSON report: the run crashed");
  if (!accounting)
    problems.push("no accounting record: the run ended before Vitest's onTestRunEnd");

  // File accounting: the files the run was given, against each witness.
  const inReport = new Set((report?.testResults ?? []).map((f) => path.basename(f.name)));
  const modules = new Map((accounting?.modules ?? []).map((m) => [path.basename(m.file), m.state]));
  if (report) {
    const missing = expected.filter((file) => !inReport.has(file));
    if (missing.length > 0)
      problems.push(`file accounting: no result in the JSON report for ${missing.join(", ")}`);
    const extra = [...inReport].filter((file) => !expected.includes(file));
    if (extra.length > 0)
      problems.push(`file accounting: the JSON report has unrequested ${extra.join(", ")}`);
  }
  if (accounting) {
    const uncollected = expected.filter((file) => !modules.has(file));
    if (uncollected.length > 0)
      problems.push(`file accounting: Vitest never reported module ${uncollected.join(", ")}`);
    const unfinished = expected.filter(
      (file) => modules.has(file) && !["passed", "failed", "skipped"].includes(modules.get(file)),
    );
    if (unfinished.length > 0)
      problems.push(
        `file accounting: unfinished module ${unfinished.map((f) => `${f} (${modules.get(f)})`).join(", ")}`,
      );
    for (const error of accounting.unhandledErrors ?? []) {
      const where = error.testPath ? ` (from ${path.basename(error.testPath)})` : "";
      problems.push(`unhandled error${where}: ${error.name}: ${error.message}${causedBy([error])}`);
    }
  }

  // The exit code against the results: 1 needs a failed file or an unhandled error, 0
  // needs neither. The JSON report's own `success` is a third opinion.
  const results = fileResults(report, accounting);
  const failedFiles = results ? Object.values(results).filter((r) => !r.ok).length : 0;
  const unhandled = accounting?.unhandledErrors?.length ?? 0;
  if (proc.status === 1 && results && accounting && failedFiles === 0 && unhandled === 0)
    problems.push("Vitest exited 1, but no file failed and no error was unhandled");
  if (proc.status === 0 && (failedFiles > 0 || unhandled > 0))
    problems.push(
      `Vitest exited 0 with ${failedFiles} failed files and ${unhandled} unhandled errors`,
    );
  if (report && typeof report.success === "boolean" && report.success !== (proc.status === 0))
    problems.push(
      `the JSON report says success: ${report.success}, but Vitest exited ${proc.status}`,
    );
  return problems;
}

/** Read one process's witnesses: { results, problems }. */
export function account(proc, expected, reportFile, accountingFile) {
  const report = readJson(reportFile);
  const accounting = readJson(accountingFile);
  return {
    results: fileResults(report, accounting),
    problems: runProblems(proc, expected, report, accounting),
  };
}
