// Runs the inner project (fixture/) and accepts either outcome the README allows: the
// jest.mock works under globals: false, or the run fails with an error that names the
// setting to turn on (`globals: true` or `test.globals`). A bare "vi is not defined" is
// neither. Only error lines are read, never the whole output: Vitest's RUN line and stack
// traces carry this exhibit's own directory name, which contains "globals".
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { expect, test } from "vitest";

test("jest.mock under globals: false works, or the run names the setting", () => {
  const require = createRequire(import.meta.url);
  const bin = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("VITEST") || key === "AXIS_ACCOUNTING_FILE") delete env[key];
  const run = spawnSync(process.execPath, [bin, "run", "--root", "fixture"], {
    encoding: "utf8",
    env,
    timeout: 120_000,
  });
  const output = `${run.stdout}${run.stderr}`;
  const errors = output
    .split("\n")
    .filter((line) => /\b\w*Error\b|\[vitest-native\]/.test(line) && !/^\s+at /.test(line));
  const named =
    run.status !== 0 &&
    errors.some((line) => /\bglobals: true\b|\btest\.globals\b/.test(line)) &&
    !/vi is not defined/.test(output);
  const reference = output.match(/ReferenceError: ([^\n]*)/)?.[1];
  const outcome =
    run.status === 0
      ? "works"
      : named
        ? "names the setting"
        : `fails: ${reference ?? `exit ${run.status}`}`;
  expect(outcome, "jest.mock under globals: false works or names the setting").toMatch(
    /^(works|names the setting)$/,
  );
}, 150_000);
