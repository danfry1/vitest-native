// Runs the inner project (fixture/) and accepts either outcome the README allows: the
// jest.mock works under globals: false, or the run fails with a message that names the
// setting (globals). A bare "vi is not defined" is neither.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { expect, test } from "vitest";

test("jest.mock under globals: false works, or the run names the setting", () => {
  const require = createRequire(import.meta.url);
  const bin = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("VITEST") || key === "AXIS_ACCOUNTING_FILE") delete env[key];
  const run = spawnSync(process.execPath, [bin, "run", "--root", "fixture"], { encoding: "utf8", env, timeout: 120_000 });
  const output = `${run.stdout}${run.stderr}`;
  const named = run.status !== 0 && /\bglobals\b/.test(output) && !/vi is not defined/.test(output);
  const reference = output.match(/ReferenceError: ([^\n]*)/)?.[1];
  const outcome = run.status === 0 ? "works" : named ? "names the setting" : `fails: ${reference ?? `exit ${run.status}`}`;
  expect(outcome, "jest.mock under globals: false works or names the setting").toMatch(/^(works|names the setting)$/);
}, 150_000);
