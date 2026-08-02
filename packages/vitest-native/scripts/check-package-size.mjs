import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budget = JSON.parse(fs.readFileSync(path.join(root, "package-budget.json"), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const npmCache = fs.mkdtempSync(path.join(os.tmpdir(), "vn-package-budget-npm-"));
const packed = spawnSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, npm_config_cache: npmCache },
});
fs.rmSync(npmCache, { recursive: true, force: true });
if (packed.status !== 0) {
  process.stderr.write(packed.stderr);
  console.error("Package budget check could not inspect the npm artifact.");
  process.exit(1);
}

let artifact;
try {
  [artifact] = JSON.parse(packed.stdout);
} catch {
  console.error(`Package budget check received invalid npm output:\n${packed.stdout}`);
  process.exit(1);
}

const requiredArtifactFields = ["size", "unpackedSize", "entryCount"];
if (
  !artifact ||
  requiredArtifactFields.some((field) => !Number.isInteger(artifact[field]) || artifact[field] < 0)
) {
  console.error(`Package budget check received an unexpected npm report:\n${packed.stdout}`);
  process.exit(1);
}

const actual = {
  packedBytes: artifact.size,
  unpackedBytes: artifact.unpackedSize,
  files: artifact.entryCount,
  runtimeDependencies: Object.keys(packageJson.dependencies ?? {}).length,
  exportPaths: Object.keys(packageJson.exports ?? {}).length,
};
/**
 * Ceilings AND floors.
 *
 * Every limit here used to be an upper bound, so the check only ever noticed the
 * package growing. Measured against an unbuilt tree it reported "OK files: 8 / 85"
 * and exited 0 — a budget that passes while measuring nothing. A build that lost
 * the verbatim-copied native runtime reported "OK files: 60 / 85" just as happily,
 * though nothing using the native engine can start without it.
 *
 * `exportPaths` is checked exactly rather than bounded. Deleting a public entry
 * point is a breaking change for consumers, and it read as "OK exportPaths: 9 / 11"
 * — a shrinking published surface, reported by the check whose job is to track the
 * published surface. Adding one is a support commitment. Both should be a
 * deliberate edit to this file, not a silent pass.
 *
 * `runtimeDependencies` keeps a ceiling only: shipping fewer dependencies is never
 * the regression.
 *
 * Remaining headroom is printed for every bounded check, and a ceiling the artifact
 * is within `warnHeadroomRatio` of warns. Ceilings used to sit under 1% above the
 * artifact, so ordinary changes exhausted them silently and the first sign was a red
 * main — twice from changes that were each green on their own. Showing the headroom
 * makes the drift visible while it can still be handled deliberately.
 */
const checks = [
  { key: "packedBytes", min: budget.minPackedBytes, max: budget.maxPackedBytes },
  { key: "unpackedBytes", min: budget.minUnpackedBytes, max: budget.maxUnpackedBytes },
  { key: "files", min: budget.minFiles, max: budget.maxFiles },
  { key: "runtimeDependencies", max: budget.maxRuntimeDependencies },
  { key: "exportPaths", min: budget.exportPaths, max: budget.exportPaths },
];

// A ceiling the artifact is this close to is reported as nearly exhausted, but only
// for the bounded scale budgets. `exportPaths` is exact and `runtimeDependencies` is
// a policy cap where sitting at the limit is the intended state — warning that two of
// two dependencies are used would be noise on every run.
const warnRatio = typeof budget.warnHeadroomRatio === "number" ? budget.warnHeadroomRatio : 0;
const isScaleBudget = (min, max) => typeof min === "number" && min !== max;

let failed = false;
const under = [];
const tight = [];
console.log("Published package budget:");
for (const { key, min, max } of checks) {
  const value = actual[key];
  const tooBig = typeof max === "number" && value > max;
  const tooSmall = typeof min === "number" && value < min;
  failed ||= tooBig || tooSmall;
  if (tooSmall) under.push(key);
  const range = typeof min === "number" ? `${min}..${max}` : `<= ${max}`;
  let headroom = "";
  if (isScaleBudget(min, max) && !tooBig) {
    const ratio = (max - value) / max;
    if (ratio < warnRatio) tight.push(`${key}: ${max - value} left of ${max}`);
    headroom = `  (${(ratio * 100).toFixed(1)}% headroom)`;
  }
  console.log(`  ${tooBig || tooSmall ? "FAIL" : "OK  "} ${key}: ${value} / ${range}${headroom}`);
}

if (tight.length > 0) {
  // Not a failure: the artifact is still inside the budget. But a ceiling this
  // close is about to fail on unrelated work, and the useful moment to re-baseline
  // it — with a measurement and a justification — is now, not after main is red.
  console.warn(
    `\nCeilings nearly exhausted:\n${tight.map((t) => `  ${t}`).join("\n")}\n` +
      "Re-baseline package-budget.json deliberately, or find what grew.",
  );
}

if (failed) {
  // A shrink in the artifact and a shrink in the export map are different
  // problems: the first is nearly always an incomplete build, the second is a
  // breaking change. Reporting a build hint for a deleted entry point would send
  // the reader to look at dist/ for something that is not there.
  const messages = [];
  if (under.some((key) => key !== "exportPaths")) {
    messages.push(
      "The published artifact is SMALLER than expected. That is usually a build that did not run\n" +
        "or did not finish — check dist/ before touching the floor. If the reduction is real,\n" +
        "lower the floor in package-budget.json with a justification.",
    );
  }
  if (under.includes("exportPaths")) {
    messages.push(
      "Fewer export paths than declared: a public entry point was removed, which is a BREAKING\n" +
        "change for consumers. If that is intended, update `exportPaths` in package-budget.json\n" +
        "and make sure the removal is in a changeset as a major.",
    );
  }
  if (messages.length === 0) {
    messages.push(
      "Package budget exceeded. Reduce the published surface or update the budget with an explicit justification.",
    );
  }
  console.error(messages.join("\n\n"));
  process.exit(1);
}
