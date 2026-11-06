// jest-compat's manual mocks with the precompiled React Native registry cold and warm, and
// in a reused (hot) worker. React Native's own requires go through that registry, which
// asks jest-compat for a mock past Node's loader, so a manual mock of a React Native module
// can behave differently once the registry is cached: #566's review found
// __mocks__/react-native.js failing only with a warm one. Each fixture runs:
//   1. cold: its registry cache deleted first, so the run compiles it;
//   2. warm: the same run again, which must reuse that registry, not compile a new one;
//   3. hot: the same files in one reused worker.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitest = path.join(packageRoot, "scripts/ci/vitest.mjs");

const FIXTURES = [
  { config: "tests-native/vitest.root-mocks.config.mts", root: "tests-native/root-mocks" },
  { config: "tests-native/vitest.root-mocks-rn.config.mts", root: "tests-native/root-mocks-rn" },
];

function run(config, mode) {
  const result = spawnSync(process.execPath, [vitest, "run", "--config", config, "--mode", mode], {
    cwd: packageRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${config} --mode ${mode} failed (exit ${result.status})`);
  }
}

/** The registry files in the fixture's cache, with their modification times. */
function registryFiles(root) {
  const dir = path.join(packageRoot, root, "node_modules/.cache/vitest-native/registry");
  if (!fs.existsSync(dir)) return new Map();
  return new Map(
    fs.readdirSync(dir).map((name) => [name, fs.statSync(path.join(dir, name)).mtimeMs]),
  );
}

for (const { config, root } of FIXTURES) {
  const cache = path.join(packageRoot, root, "node_modules/.cache/vitest-native/registry");
  fs.rmSync(cache, { recursive: true, force: true });
  console.log(`\n== ${root}: cold (registry cache deleted)`);
  run(config, "stock");
  const compiled = registryFiles(root);
  if (compiled.size === 0) throw new Error(`${root}: the cold run compiled no registry`);

  console.log(`\n== ${root}: warm (the registry from the cold run)`);
  run(config, "stock");
  const reused = registryFiles(root);
  for (const [name, mtime] of compiled) {
    if (reused.get(name) !== mtime) {
      throw new Error(`${root}: the warm run rewrote ${name} instead of reusing it`);
    }
  }

  console.log(`\n== ${root}: hot`);
  run(config, "hot");
}
console.log("\nroot mocks: cold, warm and hot runs passed");
