/**
 * tests-native/support/spawns-own-run.mts: the native test files that run an app as its
 * own Vitest run, which the forks, hot and ownership configs exclude (the run does not
 * see their config, so running the file again repeats it).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { spawnsOwnRun } from "../tests-native/support/spawns-own-run.mts";

const here = path.dirname(fileURLToPath(import.meta.url));
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it("lists the test files that import runApp, and only those", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-spawns-"));
  temps.push(dir);
  const files = {
    "a.test.ts": 'import { runApp } from "./support/run-app";',
    "b.test.tsx": "import { type Edit, runApp } from './support/run-app.ts';",
    "c.test.ts": 'import { runTempRoot } from "./support/run-temp-root";',
    "d.test.ts":
      '// Spawns its own config, unlike support/run-app.ts.\nimport { spawnSync } from "node:child_process";',
    "run-app-notes.md": 'from "./support/run-app"',
  };
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  expect(spawnsOwnRun(dir)).toEqual(["tests-native/a.test.ts", "tests-native/b.test.tsx"]);
});

it("is excluded by every config other than the main one that includes tests-native/*.test.ts", () => {
  const configs = fs
    .readdirSync(path.join(here, "../tests-native"))
    .filter((name) => /^vitest\..*config\.mts$/.test(name) && name !== "vitest.config.mts");
  const broad = configs.filter((name) =>
    fs
      .readFileSync(path.join(here, "../tests-native", name), "utf8")
      .includes('"tests-native/*.test.ts"'),
  );
  expect(broad.sort()).toEqual([
    "vitest.forks.config.mts",
    "vitest.hot.config.mts",
    "vitest.ownership.config.mts",
  ]);
  for (const name of broad) {
    expect(fs.readFileSync(path.join(here, "../tests-native", name), "utf8"), name).toMatch(
      /exclude:\s*\[[^\]]*\.\.\.SPAWNS_OWN_RUN/,
    );
  }
});
