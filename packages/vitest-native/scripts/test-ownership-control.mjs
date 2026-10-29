// The control for experimental.ownershipModel's identity probes: with the flag off,
// exactly the three identity assertions the shared resolver exists for must fail,
// and the other two must pass. A probe that passes without the resolver proves
// nothing about it.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vn-ownership-control-")), "r.json");
const run = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/vitest/vitest.mjs"),
    "run",
    "--config",
    "tests-native/vitest.ownership.config.mts",
    "--mode",
    "off",
    "--reporter=json",
    `--outputFile=${report}`,
  ],
  { cwd: root, encoding: "utf8" },
);
const results = JSON.parse(fs.readFileSync(report, "utf8"));
fs.rmSync(path.dirname(report), { recursive: true, force: true });
const statuses = Object.fromEntries(
  results.testResults.flatMap((file) => file.assertionResults.map((t) => [t.title, t.status])),
);
const expected = {
  "root import and require share one object": "failed",
  "a library's require sees what the test set": "failed",
  "deep conditional exports share identity": "failed",
  "a Node-owned ESM dynamic import shares identity": "passed",
  "a nested second version stays the requester's own": "passed",
};
const wrong = Object.entries(expected).filter(([title, status]) => statuses[title] !== status);
if (run.status !== 1 || wrong.length > 0) {
  console.error(run.stdout, run.stderr);
  console.error("unexpected control outcome:", JSON.stringify(statuses, null, 2));
  process.exit(1);
}
console.log("ownership control: the three identity probes fail with the flag off, as expected");
