import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The budget for the first transform that misses every cache: it starts the Babel
 * worker thread and loads the React Native preset, several seconds on a cold CI runner
 * (5.6 s on macOS once), against Vitest's 5 s test timeout. It matches the worker's own
 * 60 s answer deadline in src/native/transform.mjs.
 */
export const COLD_TRANSFORM_BUDGET_MS = 60_000;

/**
 * Starts the Babel worker before a file's tests, so no test pays the cold start:
 * `beforeAll(() => warmTransform(transformRN, projectRoot), COLD_TRANSFORM_BUDGET_MS)`.
 *
 * Pass the test file's own `transformRN`: each test file has its own instance of
 * transform.mjs, with its own worker. The input is a fresh file under a temporary
 * directory with a unique body, so neither the in-memory cache (path, mtime, size) nor
 * the disk cache (path, content) can answer it.
 */
export function warmTransform(
  transformRN: (file: string, src: string, root: string) => string,
  projectRoot: string,
): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vn-transform-warm-"));
  try {
    const file = path.join(dir, "warm.ts");
    const src = `export const warm: number = ${Date.now()};`;
    fs.writeFileSync(file, src);
    if (!transformRN(file, src, projectRoot).includes("warm")) {
      throw new Error("the warm-up transform returned unexpected output");
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
