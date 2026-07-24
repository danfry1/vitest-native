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
const limits = {
  packedBytes: budget.maxPackedBytes,
  unpackedBytes: budget.maxUnpackedBytes,
  files: budget.maxFiles,
  runtimeDependencies: budget.maxRuntimeDependencies,
  exportPaths: budget.maxExportPaths,
};

let failed = false;
console.log("Published package budget:");
for (const key of Object.keys(limits)) {
  const over = actual[key] > limits[key];
  failed ||= over;
  console.log(`  ${over ? "FAIL" : "OK  "} ${key}: ${actual[key]} / ${limits[key]}`);
}

if (failed) {
  console.error(
    "Package budget exceeded. Reduce the published surface or update the budget with an explicit justification.",
  );
  process.exit(1);
}
