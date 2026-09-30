// Offline two-project execution gate. Uses the built plugin and locally installed
// dependencies; packed package-manager coverage is provided by test:consumers.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const req = createRequire(path.join(packageRoot, "package.json"));
const cli = path.join(path.dirname(req.resolve("vitest/package.json")), "vitest.mjs");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "vn-metro-projects-"));
const plugin = process.env.VN_METRO_PLUGIN_OVERRIDE
  ? pathToFileURL(path.resolve(process.env.VN_METRO_PLUGIN_OVERRIDE)).href
  : pathToFileURL(path.join(packageRoot, "dist/index.mjs")).href;
// Counterfactual only: same CJS value without lexer's direct-reexport preparse.
// Do not substitute this control for the direct-reexport correctness gate.
const indirectControl = process.argv.includes("--indirect-control");
const legacyControl = process.argv.includes("--legacy-control");
const nodePatchControl = process.argv.includes("--node-fast-path-control");
const workers = process.argv.includes("--two-workers") ? 2 : 1;
const files = workers === 2 ? ["a", "b", "c", "d"] : ["a", "b"];
const traceFile = path.join(fixture, "execution.jsonl");

function write(file, source) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

try {
  write(path.join(fixture, "package.json"), '{"name":"metro-project-gate","type":"module"}');
  const modules = path.join(fixture, "node_modules");
  fs.mkdirSync(modules);
  for (const name of fs.readdirSync(path.join(packageRoot, "node_modules"))) {
    if (name.startsWith(".")) continue;
    fs.symlinkSync(
      path.join(packageRoot, "node_modules", name),
      path.join(modules, name),
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  for (const winner of ["js", "tsx"]) {
    const expected = legacyControl ? "js" : winner;
    const root = path.join(fixture, winner);
    write(path.join(root, "package.json"), JSON.stringify({ name: `profile-${winner}` }));
    const sourceExts =
      winner === "js" ? ["js", "jsx", "json", "ts", "tsx"] : ["tsx", "ts", "js", "jsx", "json"];
    write(
      path.join(root, "metro.config.cjs"),
      `module.exports = { resolver: { sourceExts: ${JSON.stringify(sourceExts)} }};`,
    );
    for (const ext of ["js", "tsx"]) {
      write(path.join(root, `winner.${ext}`), `export default '${ext}';`);
      write(
        path.join(root, "node_modules/profile-probe", `winner.${ext}`),
        `module.exports = '${ext}';`,
      );
    }
    write(
      path.join(root, "node_modules/profile-probe/package.json"),
      '{"name":"profile-probe","main":"index.cjs"}',
    );
    write(
      path.join(root, "node_modules/profile-probe/index.cjs"),
      indirectControl
        ? "const winner = require('./winner'); module.exports = winner;"
        : "module.exports = require('./winner');",
    );
    for (const file of files) {
      write(
        path.join(root, `${file}.test.mjs`),
        `
        import { expect, test } from 'vitest';
        import { appendFileSync } from 'node:fs';
        import { threadId } from 'node:worker_threads';
        import { Platform } from 'react-native';
        import nodeWinner from 'profile-probe';
        import viteWinner from './winner';
        test('profile winner ${winner} through both graphs', () => {
          appendFileSync(${JSON.stringify(traceFile)}, JSON.stringify({
            project: ${JSON.stringify(winner)}, file: ${JSON.stringify(file)},
            pid: process.pid, threadId, nodeWinner,
          }) + '\\n');
          expect(Platform.OS).toBe('ios');
          expect(viteWinner).toBe(${JSON.stringify(expected)});
          expect(nodeWinner).toBe(${JSON.stringify(expected)});
        });
      `,
      );
    }
  }
  write(
    path.join(fixture, "vitest.config.mjs"),
    `
    import path from 'node:path';
    import { defineConfig } from 'vitest/config';
    import { BaseSequencer } from 'vitest/node';
    import { reactNative } from ${JSON.stringify(plugin)};
    class PinnedSequencer extends BaseSequencer {
      async sort(specs) {
        return [...specs].sort((a, b) => a.moduleId.localeCompare(b.moduleId) * (process.env.VN_METRO_REVERSE === '1' ? -1 : 1));
      }
    }
    export default defineConfig({ test: { projects: ['js', 'tsx'].map(name => ({
      root: path.join(import.meta.dirname, name),
      plugins: [reactNative({ engine: 'native', presets: [],
        metroConfig: process.env.VN_METRO_NEGATIVE !== '1' && process.env.VN_METRO_LEGACY !== '1',
        hotRuntime: process.env.VN_METRO_HOT === '1' ? ${workers === 1 ? "{ allowUnboundedMemory: true }" : "true"} : false,
      })],
      test: { name, include: ['*.test.mjs'], maxWorkers: ${workers}, fileParallelism: ${workers > 1},
        sequence: { sequencer: PinnedSequencer } },
    })) }});
  `,
  );
  const outcomes = [];
  const modes = [
    ["default", false],
    ["default", true],
    ["hot", false],
    ["hot", true],
  ];
  if (!legacyControl) modes.push(["negative", false]);
  const researchEnv = nodePatchControl
    ? {
        VN_CJS_FAST_PATH_RESEARCH: "1",
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${new URL("./probe-node-cjs-fast-path-patch.mjs", import.meta.url).href}`,
      }
    : {};
  for (const [mode, reverse] of modes) {
    write(traceFile, "");
    const result = spawnSync(process.execPath, [cli, "run", "--config", "vitest.config.mjs"], {
      cwd: fixture,
      encoding: "utf8",
      timeout: 90_000,
      env: {
        ...process.env,
        ...researchEnv,
        VN_METRO_LEGACY: legacyControl ? "1" : "0",
        VN_METRO_NEGATIVE: mode === "negative" ? "1" : "0",
        VN_METRO_HOT: mode === "hot" ? "1" : "0",
        VN_METRO_REVERSE: reverse ? "1" : "0",
      },
    });
    const output = (result.stdout ?? "") + (result.stderr ?? "");
    process.stdout.write(
      `\nMode: ${mode}; reverse: ${reverse}; indirect control: ${indirectControl}\n${output}`,
    );
    assert.ifError(result.error);
    const trace = fs
      .readFileSync(traceFile, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const groups = new Map();
    for (const event of trace) {
      const key = `${event.project}:${event.pid}:${event.threadId}`;
      const group = groups.get(key) ?? [];
      group.push(event.file);
      groups.set(key, group);
    }
    const workerReused = [...groups.values()].some((group) => group.length > 1);
    const executionObserved = trace.length === files.length * 2 && (mode !== "hot" || workerReused);
    const passed =
      executionObserved &&
      (mode === "negative"
        ? result.status !== 0 && /expected 'js' to be 'tsx'/.test(output)
        : result.status === 0 && new RegExp(`${files.length * 2} passed`).test(output));
    outcomes.push({
      mode,
      reverse,
      passed,
      exitCode: result.status,
      workerReused,
      execution: Object.fromEntries(groups),
      trace,
    });
  }
  console.log(
    JSON.stringify(
      { indirectControl, legacyControl, nodePatchControl, workers, outcomes },
      null,
      2,
    ),
  );
  assert.ok(
    outcomes.every((result) => result.passed),
    "two-project gate failed; see all outcomes above",
  );
  console.log(
    "PASS: two projects, both file orders, both graphs, default/hot and negative control",
  );
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
