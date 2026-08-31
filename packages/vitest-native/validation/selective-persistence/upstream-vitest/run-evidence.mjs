import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../../..");
const defaultVitest = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const binaries = process.argv.slice(2).map((binary) => path.resolve(binary));
if (!binaries.length) binaries.push(defaultVitest);

const passingConfigs = [
  "vitest.config.mjs",
  "vitest.parallel.config.mjs",
  "vitest.projects.config.mjs",
  "vitest.flaky.config.mjs",
];

function run(binary, config, extraEnv = {}) {
  const packageDirectory = path.dirname(binary);
  const entry = pathToFileURL(path.join(packageDirectory, "dist/index.js")).href;
  return spawnSync(process.execPath, [binary, "run", "--config", path.join(here, config)], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
      VN_UPSTREAM_VITEST_ENTRY: entry,
    },
  });
}

const report = [];
for (const binary of binaries) {
  for (const config of passingConfigs) {
    const result = run(binary, config);
    report.push({ binary, config, expected: "pass", status: result.status });
    if (result.status !== 0) {
      process.stderr.write(result.stdout);
      process.stderr.write(result.stderr);
      throw new Error(`${path.basename(binary)} failed ${config}`);
    }
  }

  for (let seed = 1; seed <= 5; seed++) {
    const result = run(binary, "vitest.config.mjs", { VN_SHUFFLE_SEED: String(seed) });
    report.push({
      binary,
      config: "vitest.config.mjs",
      seed,
      expected: "pass",
      status: result.status,
    });
    if (result.status !== 0) {
      process.stderr.write(result.stdout);
      process.stderr.write(result.stderr);
      throw new Error(`${path.basename(binary)} failed shuffled seed ${seed}`);
    }
  }

  const control = run(binary, "vitest.control.config.mjs");
  report.push({
    binary,
    config: "vitest.control.config.mjs",
    expected: "fail",
    status: control.status,
  });
  if (control.status === 0) {
    process.stdout.write(control.stdout);
    throw new Error(`${path.basename(binary)} negative control unexpectedly passed`);
  }
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
