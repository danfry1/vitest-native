// The coverage of covered.ts, read from coverage-v8's JSON report: the statements that ran
// (the `if`, `return "taken"`, `picked`) are counted, and `return "not taken"` is not.
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
const reportFile = path.join(root, "coverage", "coverage-final.json");
if (!fs.existsSync(reportFile)) {
  console.log("no coverage report was written");
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
const entry = Object.entries(report).find(([file]) => file.endsWith("covered.ts"))?.[1];
if (!entry) {
  console.log("covered.ts is not in the coverage report");
  process.exit(1);
}
const countAt = (line) =>
  Object.entries(entry.statementMap)
    .filter(([, loc]) => loc.start.line === line)
    .map(([id]) => entry.s[id]);
const taken = countAt(4);
const notTaken = countAt(6);
const picked = countAt(9);
if (!(taken.length && taken.every((n) => n > 0) && picked.every((n) => n > 0))) {
  console.log(`covered.ts: the statements that ran are not counted (line 4: ${taken}, line 9: ${picked})`);
  process.exit(1);
}
if (!(notTaken.length && notTaken.every((n) => n === 0))) {
  console.log(`covered.ts: the branch that did not run is counted (line 6: ${notTaken})`);
  process.exit(1);
}
