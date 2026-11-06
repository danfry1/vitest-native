// Packed npm consumer for the hot CJS re-export fix: the direct CJS re-export consumer
// passes under the hot runtime from a packed install.
//
// It also had a mutation control: omit the reset's CJS lookup drain
// (`resolutions.drain()` in module-reset.mjs) and expect the consumer to fail. That
// defect only shows under the threaded loader (`module.register`), which the Node floor
// removed. Under `module.registerHooks`, on every supported Node, the consumer passes
// with the drain omitted, so the control could not fail and was removed. Whether the
// drain is still needed, and a control that fails without it, is #530.
// Artifacts/logs stay in the workspace's ignored .tmp for investigation handoff.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import "../../scripts/release-age.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const scratch = path.resolve(root, "../../.tmp");
fs.mkdirSync(scratch, { recursive: true });
const dir = fs.mkdtempSync(path.join(scratch, "packed-cjs-reset-"));
const app = path.join(dir, "app");
const results = [];
function run(label, command, args, cwd) {
  console.log(`Running ${label} (${dir})`);
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 180_000,
    env: {
      ...process.env,
      npm_config_ignore_scripts: "true",
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  fs.writeFileSync(path.join(dir, `${label}.log`), output);
  assert.ifError(result.error);
  results.push({ label, status: result.status });
  return { status: result.status, output };
}
const packed = run("pack", "npm", ["pack", "--ignore-scripts", "--pack-destination", dir], root);
assert.equal(packed.status, 0, packed.output);
const tarball = fs.readdirSync(dir).find((file) => file.endsWith(".tgz"));
assert.ok(tarball);
fs.cpSync(path.join(root, "consumer-tests/current-rn"), app, { recursive: true });
const manifestFile = path.join(app, "package.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
manifest.devDependencies["vitest-native"] = `file:${path.join(dir, tarball)}`;
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
const install = run(
  "install",
  "npm",
  ["install", "--prefer-offline", "--fetch-retries=0", "--fetch-timeout=30000"],
  app,
);
assert.equal(install.status, 0, install.output);
for (const [source, name] of [
  ["state-fixture", "consumer-state-fixture"],
  ["runtime-probe", "runtime-probe"],
]) {
  const target = path.join(app, "node_modules", name);
  // Targets are exactly the two fixture-owned packages in this new install.
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(app, source), target, { recursive: true });
}
const positive = run("positive", "npm", ["run", "test:hot"], app);
assert.equal(positive.status, 0, positive.output);
assert.match(positive.output, /6 passed/);

fs.writeFileSync(
  path.join(dir, "results.json"),
  JSON.stringify({ node: process.version, results }, null, 2),
);
console.log(`PASS: packed consumer. Evidence: ${dir}`);
