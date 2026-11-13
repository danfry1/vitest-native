/**
 * A test file that runs Vitest itself is an end-to-end test: tests/*.e2e.test.ts, run by
 * vitest.e2e.config.ts after the unit suite. In the unit suite such files (each up to two
 * minutes on Windows) ran beside its fast tests and starved them of CPU until those timed
 * out at 5 s: migrate-discovery's tinyglobby test, normally under 0.6 s, took 5.3 s.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const tests = path.resolve(import.meta.dirname);

/** Starts a Vitest run: its CLI entry or its Node API, in a child process or in-process. */
const RUNS_VITEST = /vitest\.mjs|\bvitestBin\b|\bvitestEntry\b|\bstartVitest\(|\bcreateVitest\(/;
const SPAWNS =
  /\bspawnSync\(|\bspawn\(|\bexecFileSync\(|\bexecFile\(|\bfork\(|\bstartVitest\(|\bcreateVitest\(/;

function testFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "fixtures" ? [] : testFiles(abs);
    return /\.test\.[cm]?[jt]sx?$/.test(entry.name) ? [abs] : [];
  });
}

describe("end-to-end placement", () => {
  it("keeps every test file that runs Vitest out of the unit suite", () => {
    const misplaced = testFiles(tests)
      .filter((file) => !/\.e2e\.test\./.test(file))
      .filter((file) => {
        const source = fs.readFileSync(file, "utf8");
        return RUNS_VITEST.test(source) && SPAWNS.test(source);
      })
      .map((file) => path.relative(tests, file));
    expect(misplaced).toEqual([]);
  });

  it("finds the end-to-end files it is guarding", () => {
    const e2e = testFiles(tests).filter((file) => /\.e2e\.test\./.test(file));
    expect(e2e.length).toBeGreaterThanOrEqual(8);
  });
});
