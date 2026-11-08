// jest-compat's manual mocks with the precompiled React Native registry cold and warm, and
// in a reused (hot) worker. React Native's own requires go through that registry, which
// asks jest-compat for a mock past Node's loader, so a manual mock of a React Native module
// can behave differently once the registry is cached: #566's review found
// __mocks__/react-native.js failing only with a warm one. Each fixture runs:
//   1. cold: the run compiles the registry;
//   2. warm: the same run again, which must reuse it and compile nothing;
//   3. hot: the same files in one reused worker.
// Whether a run compiled the registry is read from the engine's own diagnostics, and its
// location from the engine's cacheRootFor. With VITEST_NATIVE_NO_REGISTRY=1 the registry
// is off by design: every run still has to pass, and the cold/warm checks are skipped.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cacheRootFor } from "../dist/native/transform.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitest = path.join(packageRoot, "scripts/ci/vitest.mjs");

const FIXTURES = [
  { config: "tests-native/vitest.root-mocks.config.mts", root: "tests-native/root-mocks" },
  { config: "tests-native/vitest.root-mocks-rn.config.mts", root: "tests-native/root-mocks-rn" },
];

// The engine's diagnostics (src/native/registry-process.mjs, registry.mjs): a compile in
// the background, in a bounded child (CI), or in-process.
const COMPILED =
  /\[vitest-native\] \(native\) (?:no precompiled RN registry for this graph yet|precompiled RN registry (?:in the background|in a bounded child|: \d+ modules))/;
const UNAVAILABLE = /could not precompile the React Native registry/;
const registryOff = process.env.VITEST_NATIVE_NO_REGISTRY === "1";

function run(config, mode) {
  const result = spawnSync(process.execPath, [vitest, "run", "--config", config, "--mode", mode], {
    cwd: packageRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, VN_REGISTRY_DIAGNOSTICS: "1" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  if (result.status !== 0) {
    throw new Error(`${config} --mode ${mode} failed (exit ${result.status})`);
  }
  if (!registryOff && UNAVAILABLE.test(output)) {
    throw new Error(`${config} --mode ${mode}: the registry was unavailable`);
  }
  return output;
}

/** The registry files in `dir`, with their modification times. */
function registryFiles(dir) {
  if (!fs.existsSync(dir)) return new Map();
  return new Map(
    fs.readdirSync(dir).map((name) => [name, fs.statSync(path.join(dir, name)).mtimeMs]),
  );
}

for (const { config, root } of FIXTURES) {
  const fixture = path.join(packageRoot, root);
  if (registryOff) {
    console.log(`\n== ${root}: VITEST_NATIVE_NO_REGISTRY=1, so no registry to run cold or warm`);
    run(config, "stock");
    console.log(`\n== ${root}: hot`);
    run(config, "hot");
    continue;
  }
  // A project's cache lives in its own node_modules (cacheRootFor). A fixture has none
  // in a fresh checkout, so its cache would be the package's, shared with every other
  // fixture; give it its own, as an installed app has, so the cold run is really cold.
  fs.mkdirSync(path.join(fixture, "node_modules"), { recursive: true });
  const cache = path.join(cacheRootFor(fixture), "registry");
  if (!cache.startsWith(path.join(fixture, "node_modules") + path.sep)) {
    throw new Error(`${root}: the engine puts its registry outside the fixture (${cache})`);
  }
  fs.rmSync(cache, { recursive: true, force: true });

  console.log(`\n== ${root}: cold (registry cache ${path.relative(packageRoot, cache)} deleted)`);
  if (!COMPILED.test(run(config, "stock"))) {
    throw new Error(`${root}: the cold run did not report compiling the registry`);
  }
  const compiled = registryFiles(cache);
  if (compiled.size === 0) throw new Error(`${root}: the cold run wrote nothing to ${cache}`);

  console.log(`\n== ${root}: warm (the registry from the cold run)`);
  if (COMPILED.test(run(config, "stock"))) {
    throw new Error(`${root}: the warm run compiled the registry again instead of reusing it`);
  }
  const reused = registryFiles(cache);
  for (const [name, mtime] of compiled) {
    if (reused.get(name) !== mtime) {
      throw new Error(`${root}: the warm run rewrote ${name} instead of reusing it`);
    }
  }

  console.log(`\n== ${root}: hot`);
  run(config, "hot");
}
console.log(
  registryOff
    ? "\nroot mocks: stock and hot runs passed (registry off: cold/warm checks skipped)"
    : "\nroot mocks: cold, warm and hot runs passed",
);
