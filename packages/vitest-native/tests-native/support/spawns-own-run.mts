import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Test files that run an app as its own Vitest run (support/run-app.ts), with the app's
 * own config. The config running the test file does not reach that run (run-app drops
 * the VITEST* environment), so another config running the file repeats the same runs,
 * each minutes long on Windows CI. They run in test:native:main only; the forks, hot and
 * ownership configs, which also include tests-native/*.test.ts, exclude them.
 *
 * Read from the files' imports, so a new test that uses runApp is excluded without a list
 * to keep.
 */
export function spawnsOwnRun(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => /\.test\.tsx?$/.test(name))
    .filter((name) =>
      /from\s+["']\.\/support\/run-app(?:\.ts)?["']/.test(
        fs.readFileSync(path.join(dir, name), "utf8"),
      ),
    )
    .sort()
    .map((name) => `tests-native/${name}`);
}

export const SPAWNS_OWN_RUN = spawnsOwnRun(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
);
