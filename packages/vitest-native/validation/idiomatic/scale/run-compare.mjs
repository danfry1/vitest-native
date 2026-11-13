// Proves hot == default at scale: generates the suite, runs it under both
// engines, and diffs per-test results. Any test that passes under default but
// fails under hot is a hot-specific correctness regression — the thing we're
// hunting. Also reports wall-clock timing (the speedup).
//
// The negative control runs the same suite with `isolate: false` and no hot reset
// (vitest.noisolate.mts), and must show regressions: if it does not, the probes no longer
// see bleed, and a clean hot run would prove nothing. VN_FRESH=1 runs the hot side with
// hotRuntime.freshRuntime.
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
  // A file name from the label (it has spaces and punctuation; Windows refuses a colon).
  const out = path.join(here, `.${label.replace(/[^A-Za-z0-9]+/g, "-")}.json`);
  fs.rmSync(out, { force: true });
  console.log(`\n── running ${label} ──`);
  const t0 = Date.now();
  const res = spawnSync(
    vitest,
    ["run", "--config", config, "--reporter=json", "--outputFile", out],
    { cwd: root, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" },
  );
  process.stderr.write(res.stderr ?? "");
  const ms = Date.now() - t0;
  const data = JSON.parse(fs.readFileSync(out, "utf8"));
  const status = new Map();
  for (const file of data.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      status.set(`${path.basename(file.name)} › ${a.fullName ?? a.title}`, a.status);
    }
  }
  return {
    ms,
    status,
    exit: res.status,
    total: data.numTotalTests,
    passed: data.numPassedTests,
    stderr: res.stderr ?? "",
  };
}

const def = run("default", path.join(here, "vitest.default.mts"));
const hotLabel = process.env.VN_FRESH === "1" ? "hot (freshRuntime)" : "hot";
const hot = run(hotLabel, path.join(here, "vitest.hot.mts"));
// A freshRuntime pass that declined (a preset holding React per worker, #719) ran with
// React resident: it would be reported as freshRuntime and prove nothing about it.
const declined = /hotRuntime\.freshRuntime declined: [^\n]*/.exec(hot.stderr)?.[0];
if (process.env.VN_FRESH === "1" && declined) {
  console.log(`\n✗ the freshRuntime pass ran with React resident: ${declined}`);
  process.exit(1);
}
const control = run("control (isolate: false, no reset)", path.join(here, "vitest.noisolate.mts"));

// Diff: tests that regressed under hot (passed default, not-passed hot).
const regressions = [];
const hotOnlyPass = [];
for (const [name, dStatus] of def.status) {
  const hStatus = hot.status.get(name);
  if (dStatus === "passed" && hStatus !== "passed")
    regressions.push({ name, hStatus: hStatus ?? "missing" });
}
for (const [name, hStatus] of hot.status) {
  const dStatus = def.status.get(name);
  if (hStatus === "passed" && dStatus && dStatus !== "passed") hotOnlyPass.push(name);
}

console.log("\n──────── RESULT ────────");
console.log(`default: ${def.passed}/${def.total} passed in ${(def.ms / 1000).toFixed(1)}s`);
console.log(
  `hot:     ${hot.passed}/${hot.total} passed in ${(hot.ms / 1000).toFixed(1)}s  (${(def.ms / hot.ms).toFixed(2)}× speed)`,
);
console.log(`hot-specific regressions (passed default, failed hot): ${regressions.length}`);
for (const r of regressions.slice(0, 40)) console.log(`  ✗ ${r.name} [hot: ${r.hStatus}]`);
if (hotOnlyPass.length)
  console.log(`(hot passed where default failed: ${hotOnlyPass.length} — usually baseline flakes)`);

// Defense-in-depth: a clean diff only counts if BOTH runs also exited 0 and ran
// the same number of tests (a crashed suite that wrote partial JSON would
// otherwise look delta-free on the tests it did report).
const cleanExits = def.exit === 0 && hot.exit === 0;
const clean = regressions.length === 0 && def.total === hot.total && cleanExits;
if (!cleanExits) console.log(`✗ non-zero vitest exit (default=${def.exit}, hot=${hot.exit})`);
// The negative control: the probes must still see bleed where nothing resets it.
const controlRegressions = [...def.status].filter(
  ([name, status]) => status === "passed" && control.status.get(name) !== "passed",
).length;
const controlSees = controlRegressions > 0;
console.log(
  `control (isolate: false, no reset): ${control.passed}/${control.total} passed, ` +
    `${controlRegressions} regression(s) against default ${controlSees ? "(the probes see bleed)" : "(NONE: the probes no longer see bleed, so a clean hot run proves nothing)"}`,
);
console.log(
  `\n${clean ? "✓ hot == default: ZERO correctness delta at scale" : "✗ correctness delta detected"}`,
);
process.exit(clean && controlSees ? 0 : 1);
