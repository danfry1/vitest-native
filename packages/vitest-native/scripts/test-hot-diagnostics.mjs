// The hot runtime's diagnostics must reach the terminal (#775). Lines written with
// console.log while Vitest started a file were dropped, so the per-file reset's
// diagnostics never printed and read as "nothing happened". This runs five files on one
// hot worker with diagnostics on and requires each line, as many times as it is due.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(packageRoot, "package.json"));
const vitestEntry = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const files = 5;

const result = spawnSync(
  process.execPath,
  [
    vitestEntry,
    "run",
    "--config",
    path.join("tests-native", "vitest.hot-nonconfigurable-global.config.mts"),
    "--mode",
    "diagnostics",
  ],
  { cwd: packageRoot, encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0" } },
);
if (result.error) throw result.error;
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
if (result.status !== 0) {
  process.stdout.write(output);
  throw new Error(`the diagnostics run exited with code ${result.status}`);
}

const count = (pattern) => output.match(new RegExp(pattern, "g"))?.length ?? 0;
const expected = [
  ["the worker boot", "\\[vitest-native\\] hot worker boot ", 1],
  ["the state manifest, once per worker", "\\[vitest-native\\] state manifest: ", 1],
  ["the module reset, once per file", "\\[vitest-native\\] hot reset: dropped \\d+ modules", files],
  // Every file after the first finds the previous file's plain global to delete.
  [
    "the deleted test-phase global, once per later file",
    "\\[vitest-native\\] hot reset: deleted test-phase globals: [^\\n]*__nonconfigTestPhase",
    files - 1,
  ],
  [
    "the kept non-configurable global, once",
    "\\[vitest-native\\] hot reset: kept globalThis\\.Symbol\\(vitest-native\\.test\\.registry\\.v1\\)",
    1,
  ],
];
const missing = expected.filter(([, pattern, times]) => count(pattern) !== times);
if (missing.length > 0) {
  process.stdout.write(output);
  throw new Error(
    `hot diagnostics missing or miscounted:\n${missing
      .map(([what, pattern, times]) => `- ${what}: expected ${times}, saw ${count(pattern)}`)
      .join("\n")}`,
  );
}
console.log(`[vitest-native] hot diagnostics gate passed: ${expected.length} lines, all printed`);
