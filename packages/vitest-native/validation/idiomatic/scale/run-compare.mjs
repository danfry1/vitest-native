// Proves hot == default at scale: generates the suite, runs it under both
// engines, and diffs per-test results. Any test that passes under default but
// fails under hot is a hot-specific correctness regression — the thing we're
// hunting. Also reports wall-clock timing (the speedup).
//
// Usage: node run-compare.mjs [count]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const vitest = path.join(root, "node_modules", ".bin", "vitest");
const count = process.argv[2] ?? "120";

console.log(`── generating ${count} files ──`);
spawnSync(process.execPath, [path.join(here, "generate.mjs"), count], { stdio: "inherit" });

function run(label, config) {
  const out = path.join(here, `.${label}.json`);
  fs.rmSync(out, { force: true });
  console.log(`\n── running ${label} ──`);
  const t0 = Date.now();
  const res = spawnSync(
    vitest,
    ["run", "--config", config, "--reporter=json", "--outputFile", out],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  const ms = Date.now() - t0;
  const data = JSON.parse(fs.readFileSync(out, "utf8"));
  const status = new Map();
  for (const file of data.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      status.set(`${path.basename(file.name)} › ${a.fullName ?? a.title}`, a.status);
    }
  }
  return { ms, status, exit: res.status, total: data.numTotalTests, passed: data.numPassedTests };
}

const def = run("default", path.join(here, "vitest.default.mts"));
const hot = run("hot", path.join(here, "vitest.hot.mts"));

// Diff: tests that regressed under hot (passed default, not-passed hot).
const regressions = [];
const hotOnlyPass = [];
for (const [name, dStatus] of def.status) {
  const hStatus = hot.status.get(name);
  if (dStatus === "passed" && hStatus !== "passed") regressions.push({ name, hStatus: hStatus ?? "missing" });
}
for (const [name, hStatus] of hot.status) {
  const dStatus = def.status.get(name);
  if (hStatus === "passed" && dStatus && dStatus !== "passed") hotOnlyPass.push(name);
}

console.log("\n──────── RESULT ────────");
console.log(`default: ${def.passed}/${def.total} passed in ${(def.ms / 1000).toFixed(1)}s`);
console.log(`hot:     ${hot.passed}/${hot.total} passed in ${(hot.ms / 1000).toFixed(1)}s  (${(def.ms / hot.ms).toFixed(2)}× speed)`);
console.log(`hot-specific regressions (passed default, failed hot): ${regressions.length}`);
for (const r of regressions.slice(0, 40)) console.log(`  ✗ ${r.name} [hot: ${r.hStatus}]`);
if (hotOnlyPass.length) console.log(`(hot passed where default failed: ${hotOnlyPass.length} — usually baseline flakes)`);

const clean = regressions.length === 0 && def.total === hot.total;
console.log(`\n${clean ? "✓ hot == default: ZERO correctness delta at scale" : "✗ correctness delta detected"}`);
process.exit(clean ? 0 : 1);
