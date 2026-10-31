// Compares a run.mjs verdict file with the main verdicts STATUS.md records
// (exhibits.json `status.main`), for the advisory museum check on pull requests:
//
//   node validation/bug-museum/compare.mjs --verdicts <run.mjs --json file>
//
// The museum is red on main by design (open bugs fail as their bug), so the run's own
// exit code says nothing about a pull request. What a pull request can change is a
// verdict:
//   regressed     main PASS, now FAIL; or main FAIL (bug), now FAIL (other): the
//                 exhibit no longer reaches its bug, so the change broke something first
//   now passes    main FAIL, now PASS: a fix. Record it (run-columns.mjs, status.mjs)
//   inconclusive  the exhibit's check.mjs reports its precondition unmet on this machine
//                 (cfg-group-conflict-fallback: hot auto decides by the runner's memory)
//   skipped       N/A here (an RNTL 12/13 or Vitest 4 install this job does not provide)
// Exits 1 when any exhibit regressed or has no verdict. Writes a Markdown table to
// GITHUB_STEP_SUMMARY when it is set.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const argument = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const file = argument("verdicts");
if (!file) {
  console.error("usage: compare.mjs --verdicts <file written by run.mjs --json>");
  process.exit(2);
}
const { verdicts } = JSON.parse(fs.readFileSync(file, "utf8"));
const { exhibits } = JSON.parse(fs.readFileSync(path.join(here, "exhibits.json"), "utf8"));

const cell = (verdict) =>
  verdict.verdict === "FAIL"
    ? verdict.matchesBug
      ? "FAIL (bug)"
      : "FAIL (other)"
    : verdict.verdict;
const precondition = (verdict) =>
  verdict.verdict === "FAIL" &&
  verdict.failures?.length > 0 &&
  verdict.failures.every((line) => line.startsWith("check.mjs: precondition not met"));

const rows = [];
for (const exhibit of exhibits) {
  const verdict = verdicts[exhibit.id];
  const recorded = exhibit.status?.main ?? "-";
  if (!verdict) {
    rows.push({ id: exhibit.id, recorded, now: "-", change: "not run" });
    continue;
  }
  const now = cell(verdict);
  let change = "same";
  if (now === "N/A") change = "skipped";
  else if (precondition(verdict)) change = "inconclusive";
  else if (now === "PASS" && recorded !== "PASS") change = "now passes";
  else if (recorded === "PASS" && now !== "PASS") change = "regressed";
  else if (recorded === "FAIL (bug)" && now === "FAIL (other)") change = "regressed";
  else if (now !== recorded) change = "changed";
  const detail =
    now === "N/A" ? verdict.reason : now.startsWith("FAIL") ? verdict.failures?.[0] : "";
  rows.push({ id: exhibit.id, recorded, now, change, detail: detail ?? "" });
}

const of = (change) => rows.filter((row) => row.change === change);
const lines = [
  "## Bug museum (advisory)",
  "",
  `${rows.length} exhibits: ${of("same").length} as recorded on main, ${of("now passes").length} now pass, ${of("regressed").length} regressed, ${of("changed").length} changed otherwise, ${of("inconclusive").length} inconclusive, ${of("skipped").length} skipped, ${of("not run").length} not run.`,
  "",
];
const listed = rows.filter((row) => row.change !== "same");
if (listed.length > 0) {
  lines.push(
    "| Exhibit | main (recorded) | this build | Change | Detail |",
    "|---|---|---|---|---|",
  );
  for (const row of listed)
    lines.push(
      `| ${row.id} | ${row.recorded} | ${row.now} | ${row.change} | ${String(row.detail).replaceAll("|", "\\|").slice(0, 200)} |`,
    );
  lines.push("");
}
if (of("now passes").length > 0)
  lines.push(
    "An exhibit that now passes is a fix: record it with run-columns.mjs and status.mjs (validation/bug-museum/README.md).",
    "",
  );
const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
process.exitCode = of("regressed").length + of("not run").length > 0 ? 1 : 0;
