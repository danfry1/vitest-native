import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const nativeDir = path.resolve(import.meta.dirname, "../src/native");
const cases = [
  { name: "explicit resolve only", resolveOnly: true },
  { name: "extensionless resolve only", resolveOnly: true, extensionless: true },
  { name: "explicit load" },
  { name: "extensionless load", extensionless: true },
  { name: "platform-specific extensionless load", extensionless: true, platformFile: true },
  { name: "failed evaluation", throws: true },
  { name: "vendored RN belongs to Node", vendored: true, quiet: true },
  { name: "inline-all policy override", inlineAll: true, quiet: true },
  { name: "deliberate application require", applicationParent: true, quiet: true },
  { name: "built-in require", builtin: true, quiet: true },
];

describe("installed require-hook ownership diagnostics", () => {
  it.each(cases)("$name", (scenario) => {
    // Node resolves real paths; macOS's /var temp root aliases /private/var.
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vn-hook-ownership-")));
    try {
      // No hooks are installed in Vitest's own process. Every case exercises the
      // real resolution wrapper in a fresh process, not only the warning helper.
      const source = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installRequireHooks } from ${JSON.stringify(pathToFileURL(path.join(nativeDir, "hooks.mjs")).href)};
import { createNativeOwnershipPolicy } from ${JSON.stringify(pathToFileURL(path.join(nativeDir, "ownership.mjs")).href)};
const root = ${JSON.stringify(root)};
const scenario = ${JSON.stringify(scenario)};
const sourceDir = path.join(root, scenario.vendored ? 'vendor/rn' : 'src');
const parentDir = scenario.applicationParent ? root : path.join(root, 'node_modules/consumer');
fs.mkdirSync(sourceDir, { recursive: true });
fs.mkdirSync(parentDir, { recursive: true });
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'commonjs' }));
const target = path.join(sourceDir, scenario.platformFile ? 'state.ios.js' : 'state.js');
fs.writeFileSync(target, 'globalThis.__ownershipEvaluations++; ' + (scenario.throws ? 'throw new Error("fixture evaluation failed");' : 'module.exports = { value: 0 };'));
if (scenario.platformFile) fs.writeFileSync(path.join(sourceDir, 'state.js'), 'throw new Error("wrong platform file");');
const relative = './' + path.relative(parentDir, path.join(sourceDir, 'state.js')).split(path.sep).join('/');
const request = scenario.builtin ? 'node:fs' : scenario.extensionless ? relative.slice(0, -3) : relative;
const parent = path.join(parentDir, 'entry.cjs');
fs.writeFileSync(parent, 'exports.run = () => require' + (scenario.resolveOnly ? '.resolve' : '') + '(' + JSON.stringify(request) + ');');
const policy = createNativeOwnershipPolicy({ projectRoot: root, projectDirs: [root], reactNativeRoots: scenario.vendored ? [sourceDir] : [], serverDepsInlineAll: !!scenario.inlineAll });
process.env.VITEST_NATIVE_OWNERSHIP = JSON.stringify(policy.manifest());
globalThis.__ownershipEvaluations = 0;
const warnings = [];
console.warn = (...args) => warnings.push({ text: args.join(' '), evaluations: globalThis.__ownershipEvaluations });
installRequireHooks(root);
const require = createRequire(path.join(root, 'driver.cjs'));
const consumer = require(parent);
let resolvedOnly = false;
if (scenario.throws) {
  assert.throws(() => consumer.run(), /fixture evaluation failed/);
} else {
  const first = consumer.run();
  assert.equal(first, consumer.run(), 'repeat access retains identity/path');
  resolvedOnly = first === target;
}
process.stdout.write(JSON.stringify({ warnings, target, evaluations: globalThis.__ownershipEvaluations, cached: Object.hasOwn(require.cache, target), loaded: require.cache[target]?.loaded ?? false, resolvedOnly }));
`;
      const env = { ...process.env };
      for (const key of Object.keys(env)) {
        if (key.startsWith("VITEST_NATIVE_") || ["NODE_OPTIONS", "NODE_PATH"].includes(key)) {
          delete env[key];
        }
      }
      const child = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
        env,
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(child.error).toBeUndefined();
      expect(child.status, child.stderr).toBe(0);
      const result = JSON.parse(child.stdout);
      const evaluated = !scenario.resolveOnly && !scenario.builtin;
      expect(result.evaluations).toBe(evaluated ? 1 : 0);
      expect(result.cached).toBe(evaluated && !scenario.throws);
      expect(result.loaded).toBe(evaluated && !scenario.throws);
      expect(result.resolvedOnly).toBe(!!scenario.resolveOnly);
      expect(result.warnings).toHaveLength(scenario.quiet ? 0 : 1);
      for (const warning of result.warnings) {
        expect(warning.evaluations).toBe(0);
        expect(warning.text).toContain(result.target);
        expect(warning.text).toContain("Node resolved");
        expect(warning.text).toContain(
          "Resolution alone does not prove execution or duplicate instances",
        );
        expect(warning.text).not.toMatch(/Node loaded|now exists twice|observed owner/);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
