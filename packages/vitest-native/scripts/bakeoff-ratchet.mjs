// Real-app bake-off ratchet: pack THIS checkout, run the public bake-off apps
// (react-native-paper, obytes template) against it — stock AND hot runtime —
// and compare pass counts to the committed thresholds in bakeoffs-ratchet.json.
//
// Why: synthetic and package suites have missed real regressions before (the
// hot-runtime drain regression was caught only by a manual react-native-paper
// run). This institutionalizes that check: pass counts may only go UP.
//
//   node scripts/bakeoff-ratchet.mjs --bakeoffs <checkout-of-vitest-native-bakeoffs>
//   node scripts/bakeoff-ratchet.mjs --bakeoffs <dir> --apps paper
//   node scripts/bakeoff-ratchet.mjs --bakeoffs <dir> --update   # record new thresholds
//
// Exit: 1 if any app/mode falls below its threshold (or fails to produce
// results); 0 otherwise. Improvements never fail — they print a reminder to
// re-run with --update so the ratchet only moves forward deliberately.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ratchetPath = path.join(root, "bakeoffs-ratchet.json");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const bakeoffsDir = argValue("--bakeoffs");
const update = process.argv.includes("--update");
const apps = (argValue("--apps") ?? "paper,obytes").split(",").filter(Boolean);

if (!bakeoffsDir || !fs.existsSync(bakeoffsDir)) {
  console.error("✗ pass --bakeoffs <dir> pointing at a checkout of danfry1/vitest-native-bakeoffs");
  process.exit(1);
}
const ratchet = JSON.parse(fs.readFileSync(ratchetPath, "utf8"));

function run(command, args, opts = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  return spawnSync(command, args, { stdio: "inherit", ...opts });
}

// --- 1. Pack this checkout (same mechanism as the consumer tests). ---
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-bakeoff-pack-"));
const packRes = run("npm", ["pack", "--ignore-scripts", "--pack-destination", packDir], {
  cwd: root,
});
if (packRes.status !== 0) {
  console.error("✗ npm pack failed");
  process.exit(1);
}
const tarballName = fs.readdirSync(packDir).find((f) => f.endsWith(".tgz"));
const tarball = path.join(packDir, tarballName);
console.log(`packed: ${tarball}`);

// --- 2. Run each app's setup (prepares a pinned checkout with our tarball
// installed, and runs the suite once — expected non-zero: bake-offs are not
// 100% green; the counts below are the signal). ---
const APP_DIRS = { paper: ".paper", obytes: ".obytes" };

function collectCounts(appDir, configFile, label) {
  const outFile = path.join(appDir, `.vn-ratchet-${label}.json`);
  fs.rmSync(outFile, { force: true });
  const res = spawnSync(
    path.join(appDir, "node_modules", ".bin", "vitest"),
    ["run", "--config", configFile, "--reporter=json", `--outputFile=${outFile}`],
    { cwd: appDir, stdio: "ignore" },
  );
  if (!fs.existsSync(outFile)) {
    console.error(`✗ ${label}: vitest produced no JSON output (exit ${res.status})`);
    return null;
  }
  const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
  return { passed: report.numPassedTests, total: report.numTotalTests };
}

const results = {};
let failed = false;
let improved = false;

for (const app of apps) {
  const appSrc = path.join(bakeoffsDir, app);
  if (!fs.existsSync(path.join(appSrc, "setup.sh"))) {
    console.error(`✗ ${app}: no setup.sh in ${appSrc}`);
    failed = true;
    continue;
  }

  console.log(`\n════ ${app}: preparing pinned app checkout ════`);
  // setup.sh's LAST step is the suite run itself, which exits non-zero on the
  // expected residual failures — the prepared directory is complete either way.
  run("bash", ["setup.sh"], {
    cwd: appSrc,
    env: { ...process.env, VITEST_NATIVE: `file:${tarball}` },
  });

  const appDir = path.join(appSrc, APP_DIRS[app]);
  if (!fs.existsSync(appDir)) {
    console.error(`✗ ${app}: setup.sh did not produce ${APP_DIRS[app]}`);
    failed = true;
    continue;
  }

  // Stock (isolate: true) counts.
  const stock = collectCounts(appDir, "vitest.config.mts", "stock");

  // Hot-runtime counts: same config with hotRuntime flipped on. The PR #55
  // lesson — hot changes must be validated against a real app WITH hot on.
  const configSrc = fs.readFileSync(path.join(appDir, "vitest.config.mts"), "utf8");
  const hotConfig = configSrc.replace("engine: 'native'", "engine: 'native', hotRuntime: true");
  if (hotConfig === configSrc) {
    console.error(`✗ ${app}: could not derive the hot config (engine option not found)`);
    failed = true;
    continue;
  }
  fs.writeFileSync(path.join(appDir, "vitest.hot.config.mts"), hotConfig);
  const hot = collectCounts(appDir, "vitest.hot.config.mts", "hot");

  results[app] = { stock, hot };
}

// --- 3. Compare against the ratchet. ---
console.log("\n════ ratchet comparison ════");
const summaryLines = [
  "| App | Mode | Passed | Threshold | Total |",
  "| --- | --- | --- | --- | --- |",
];
for (const app of apps) {
  for (const mode of ["stock", "hot"]) {
    const got = results[app]?.[mode];
    const want = ratchet.apps?.[app]?.[mode];
    if (!got) {
      console.error(`✗ ${app}/${mode}: no results`);
      failed = true;
      continue;
    }
    const status = !want
      ? "NEW"
      : got.passed < want.passed || got.total < want.total
        ? "REGRESSED"
        : got.passed > want.passed
          ? "IMPROVED"
          : "OK";
    if (status === "REGRESSED") failed = true;
    if (status === "IMPROVED") improved = true;
    console.log(
      `${status === "REGRESSED" ? "✗" : "✓"} ${app}/${mode}: ${got.passed}/${got.total} passed` +
        (want ? ` (threshold ${want.passed}/${want.total})` : " (no threshold yet)") +
        (status !== "OK" ? ` — ${status}` : ""),
    );
    summaryLines.push(
      `| ${app} | ${mode} | ${got.passed} | ${want?.passed ?? "—"} | ${got.total} |`,
    );
  }
}

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Bake-off ratchet\n\n${summaryLines.join("\n")}\n`,
  );
}

if (update && !failed) {
  ratchet.apps = ratchet.apps ?? {};
  for (const app of apps) {
    if (results[app]?.stock && results[app]?.hot) ratchet.apps[app] = results[app];
  }
  fs.writeFileSync(ratchetPath, `${JSON.stringify(ratchet, null, 2)}\n`);
  console.log(`\n✓ thresholds updated in ${path.relative(root, ratchetPath)} — commit the change.`);
} else if (improved && !failed) {
  console.log(
    "\n↑ pass counts improved — re-run with --update and commit the new thresholds so the ratchet advances.",
  );
}

fs.rmSync(packDir, { recursive: true, force: true });
if (failed) {
  console.error(
    "\n✗ bake-off ratchet failed: a real-app pass count fell below its recorded threshold.",
  );
  process.exit(1);
}
console.log("\n✓ bake-off ratchet holds.");
