// experimental.ownershipModel: one precompiled React Native registry per run, reused by
// the next run. Runs the flag-on shadow suite (diagnostics on) twice. A run that compiles
// prints "precompiled RN registry in a bounded child", one that cannot use the result
// prints "could not precompile", and a cache hit prints neither. So: at most one compile
// per run, none in the second, and no fallback in either. A key the parent and its
// compiler child disagree on (#542) compiles every run and falls back every time.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPILED = /precompiled RN registry in a bounded child/g;
const FALLBACK = /could not precompile the React Native registry/g;

function run() {
  const result = spawnSync(
    process.execPath,
    [
      path.join(packageRoot, "node_modules/vitest/vitest.mjs"),
      "run",
      "--config",
      "tests-native/vitest.ownership.config.mts",
      "--mode",
      "shadow",
    ],
    { cwd: packageRoot, encoding: "utf8" },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== 0) {
    console.error(output);
    throw new Error(`the flag-on shadow suite failed (exit ${result.status})`);
  }
  return {
    compiled: (output.match(COMPILED) ?? []).length,
    fallback: (output.match(FALLBACK) ?? []).length,
  };
}

const first = run();
const second = run();
const problems = [];
if (first.compiled > 1)
  problems.push(`the first run compiled the registry ${first.compiled} times`);
if (second.compiled > 0) problems.push("the second run compiled the registry again (no cache hit)");
for (const [name, counts] of [
  ["first", first],
  ["second", second],
]) {
  if (counts.fallback > 0) problems.push(`the ${name} run fell back to per-file loading`);
}
if (problems.length > 0) {
  console.error(`ownership registry reuse: ${problems.join("; ")}`);
  process.exit(1);
}
console.log(`ownership registry reuse: first run compiled ${first.compiled}, second run reused it`);
