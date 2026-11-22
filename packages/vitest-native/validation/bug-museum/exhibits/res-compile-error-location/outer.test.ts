// Runs the inner project (fixture/), whose test file imports a module that does not compile,
// and checks that the run names that module's file and line.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { expect, test } from "vitest";

test("a module that does not compile fails naming its file and line", () => {
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
  const outcome = /Subscription\.js:1[0-2]/.test(output) ? "names the file and line" : "no location";
  expect(outcome, "the compile error").toBe("names the file and line");
}, 150_000);
