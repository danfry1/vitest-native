// An exhibit run's failure lines: `file: message (caused by: …)`, one per failed test or
// failed file, WITHOUT the test's title (a signature must match what failed, not how the
// exhibit names what it expects). The run-level problems (a lost file, an unhandled
// error, an exit code the results do not explain) come from the config-axis matrix's
// accounting, unchanged.
import fs from "node:fs";
import path from "node:path";
import { runProblems } from "../../config-axes/accounting.mjs";

const firstLine = (text) => String(text ?? "").split("\n")[0];

function readJson(file) {
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

/** { failures: string[] } for one Vitest process over `files` (basenames). */
export function runLines(proc, files, reportFile, accountingFile) {
  const report = readJson(reportFile);
  const accounting = readJson(accountingFile);
  const modules = new Map((accounting?.modules ?? []).map((m) => [path.basename(m.file), m]));
  const failures = [];
  for (const file of report?.testResults ?? []) {
    const name = path.basename(file.name);
    if (!files.includes(name)) continue;
    const module = modules.get(name);
    const assertions = file.assertionResults ?? [];
    const failed = assertions.filter((a) => a.status !== "passed");
    for (const a of failed) {
      const test = module?.failedTests?.find((t) => t.name === a.title);
      failures.push(
        `${name}: ${firstLine((a.failureMessages ?? []).join(" "))}${causedBy(test?.errors)}`,
      );
    }
    const ok = file.status === "passed" && assertions.length > 0 && failed.length === 0;
    if (!ok && failed.length === 0)
      failures.push(
        `${name}: ${firstLine(file.message) || (assertions.length === 0 ? "no tests ran" : file.status)}${causedBy(module?.errors)}`,
      );
  }
  failures.push(...runProblems(proc, files, report, accounting));
  return failures;
}
