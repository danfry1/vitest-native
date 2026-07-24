// External-app observation: pack THIS checkout, run the public bake-off apps
// (react-native-paper, obytes template) against it — stock AND hot runtime —
// and compare pass counts to the committed baselines in bakeoffs-ratchet.json.
//
// Why: package-owned suites have missed integration changes before (the
// hot-runtime drain regression was caught only by a manual react-native-paper
// run). These apps also carry custom Jest-era setup and mocks, so a count change
// is only a prompt to investigate. It does not define package capability or
// prove a vitest-native regression. Package-owned contracts and crosschecks do.
//
// Run `bun run build` first — the pack ships whatever dist/ is on disk.
//
//   node scripts/bakeoff-ratchet.mjs --bakeoffs <checkout-of-vitest-native-bakeoffs>
//   node scripts/bakeoff-ratchet.mjs --bakeoffs <dir> --apps paper
//   node scripts/bakeoff-ratchet.mjs --bakeoffs <dir> --update   # record new baselines
//
// Exit: 1 if any app/mode falls below its observation baseline (or setup fails
// to produce comparable results); 0 otherwise. Improvements never fail.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyObservation, classifyObservationVerdict } from "./bakeoff-observation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ratchetPath = path.join(root, "bakeoffs-ratchet.json");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const bakeoffsDir = argValue("--bakeoffs");
const update = process.argv.includes("--update");
const apps = (argValue("--apps") ?? "paper,obytes").split(",").filter(Boolean);

function publishVerdict(verdict) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${verdict}\n`);
  }
}

if (!bakeoffsDir || !fs.existsSync(bakeoffsDir)) {
  console.error("✗ pass --bakeoffs <dir> pointing at a checkout of danfry1/vitest-native-bakeoffs");
  publishVerdict("infra");
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
  publishVerdict("infra");
  process.exit(1);
}
const tarballName = fs.readdirSync(packDir).find((f) => f.endsWith(".tgz"));
if (!tarballName) {
  console.error("✗ npm pack produced no tarball");
  publishVerdict("infra");
  process.exit(1);
}
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
  let report;
  try {
    report = JSON.parse(fs.readFileSync(outFile, "utf8"));
  } catch (error) {
    console.error(`✗ ${label}: invalid JSON report (${error.message})`);
    return null;
  }
  // Guard the reporter shape: if a future vitest renames these jest-compat
  // fields, undefined counts would compare as "OK" forever and the ratchet
  // would rot silently — fail loudly instead.
  if (!Number.isInteger(report.numPassedTests) || !Number.isInteger(report.numTotalTests)) {
    console.error(
      `✗ ${label}: unexpected JSON reporter shape (numPassedTests/numTotalTests missing)`,
    );
    return null;
  }
  return { passed: report.numPassedTests, total: report.numTotalTests };
}

const results = {};
let failed = false;
let observationChanged = false;
let infrastructureFailed = false;
let improved = false;

for (const app of apps) {
  if (!APP_DIRS[app]) {
    console.error(`✗ ${app}: unknown bake-off app`);
    failed = true;
    infrastructureFailed = true;
    continue;
  }
  const appSrc = path.join(bakeoffsDir, app);
  if (!fs.existsSync(path.join(appSrc, "setup.sh"))) {
    console.error(`✗ ${app}: no setup.sh in ${appSrc}`);
    failed = true;
    infrastructureFailed = true;
    continue;
  }

  console.log(`\n════ ${app}: preparing pinned app checkout ════`);
  // setup.sh's LAST step is the suite run itself, which exits non-zero on the
  // expected residual failures — the prepared directory is complete either way.
  const setup = run("bash", ["setup.sh"], {
    cwd: appSrc,
    env: { ...process.env, VITEST_NATIVE: `file:${tarball}` },
  });

  const appDir = path.join(appSrc, APP_DIRS[app]);
  const configFile = path.join(appDir, "vitest.config.mts");
  const vitestBin = path.join(appDir, "node_modules", ".bin", "vitest");
  if (!fs.existsSync(appDir) || !fs.existsSync(configFile) || !fs.existsSync(vitestBin)) {
    console.error(
      `✗ ${app}: setup failed before producing a comparable fixture ` +
        `(exit ${setup.status}; app/config/vitest incomplete)`,
    );
    failed = true;
    infrastructureFailed = true;
    continue;
  }
  if (setup.status !== 0) {
    console.log(
      `ℹ ${app}: setup's final test run exited ${setup.status}; fixture artifacts are complete, ` +
        "so the measured runs will determine the observation",
    );
  }

  // Stock (isolate: true) counts.
  const stock = collectCounts(appDir, "vitest.config.mts", "stock");

  // Hot-runtime counts: same config with hotRuntime flipped on. The PR #55
  // lesson — hot changes must be validated against a real app WITH hot on.
  const configSrc = fs.readFileSync(configFile, "utf8");
  const hotConfig = configSrc.replace("engine: 'native'", "engine: 'native', hotRuntime: true");
  if (hotConfig === configSrc) {
    console.error(`✗ ${app}: could not derive the hot config (engine option not found)`);
    failed = true;
    infrastructureFailed = true;
    continue;
  }
  fs.writeFileSync(path.join(appDir, "vitest.hot.config.mts"), hotConfig);
  const hot = collectCounts(appDir, "vitest.hot.config.mts", "hot");

  results[app] = { stock, hot };
}

// --- 3. Compare against the ratchet. ---
console.log("\n════ ratchet comparison ════");
const summaryLines = [
  "| App | Mode | Passed | Baseline | Total |",
  "| --- | --- | --- | --- | --- |",
];
for (const app of apps) {
  for (const mode of ["stock", "hot"]) {
    const got = results[app]?.[mode];
    const want = ratchet.apps?.[app]?.[mode];
    if (!got) {
      console.error(`✗ ${app}/${mode}: no results`);
      failed = true;
      infrastructureFailed = true;
      continue;
    }
    const status = classifyObservation(got, want);
    if (status === "CHANGED") {
      failed = true;
      observationChanged = true;
    }
    if (status === "IMPROVED") improved = true;
    console.log(
      `${status === "CHANGED" ? "✗" : "✓"} ${app}/${mode}: ${got.passed}/${got.total} passed` +
        (want ? ` (baseline ${want.passed}/${want.total})` : " (no baseline yet)") +
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
    `## External bake-off observation\n\n` +
      `Pinned bake-off repo: \`${ratchet.bakeoffsRepoSha}\`\n\n` +
      `These counts include each app's custom setup and Jest-era shims. ` +
      `A change requires investigation; it is not, by itself, a package regression.\n\n` +
      `${summaryLines.join("\n")}\n`,
  );
}

if (update && !failed) {
  ratchet.apps = ratchet.apps ?? {};
  for (const app of apps) {
    if (results[app]?.stock && results[app]?.hot) ratchet.apps[app] = results[app];
  }
  fs.writeFileSync(ratchetPath, `${JSON.stringify(ratchet, null, 2)}\n`);
  console.log(`\n✓ baselines updated in ${path.relative(root, ratchetPath)} — commit the change.`);
} else if (improved && !failed) {
  console.log(
    "\n↑ pass counts improved — re-run with --update and commit the new observation baselines.",
  );
}

fs.rmSync(packDir, { recursive: true, force: true });
// Let the workflow distinguish an observation change from an infrastructure
// failure (no results, bad reporter shape, incomplete setup).
const verdict = classifyObservationVerdict({
  changed: observationChanged,
  infra: infrastructureFailed,
});
publishVerdict(verdict);
if (failed) {
  const reason =
    verdict === "mixed"
      ? "an observation changed and another result was not comparable; investigate each independently"
      : observationChanged
        ? "an external-app observation moved below its baseline; inspect package behavior, app setup, and shims before drawing a conclusion"
        : "the external apps did not produce comparable results; no product conclusion can be drawn";
  console.error(`\n✗ bake-off observation failed: ${reason}.`);
  process.exit(1);
}
console.log("\n✓ external bake-off observations hold.");
