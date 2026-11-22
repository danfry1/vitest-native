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

/**
 * The line of every `afterAll` / `afterEach` in `source` whose body deletes something
 * (`rmSync`, `rm`, `rmdirSync`, `rmdir`, `unlinkSync`). An end-to-end file's scratch trees
 * live under the run's temporary root (vitest.e2e.config.ts), which global teardown
 * removes with no time limit. Deleted in a hook, they ran under the 10 s hook timeout and
 * failed Windows runs after every test had passed (#870; the same in tests-native, #653).
 * A test whose subject is a deletion does it in the test itself.
 */
function deletesInHooks(source: string): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(/\bafter(?:All|Each)\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const body = source.slice(open, closingParen(source, open));
    if (/\b(?:rmSync|rmdirSync|unlinkSync|rm|rmdir)\s*\(/.test(body)) {
      lines.push(source.slice(0, match.index).split("\n").length);
    }
  }
  return lines;
}

/** The index just past the `)` that closes the `(` at `open`, skipping string literals. */
function closingParen(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < source.length && source[i] !== c; i++) if (source[i] === "\\") i++;
    } else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return source.length;
}

describe("end-to-end scratch trees are left to the run's temporary root", () => {
  it("no end-to-end file deletes in an afterAll or afterEach hook", () => {
    const found = testFiles(tests)
      .filter((file) => /\.e2e\.test\./.test(file))
      .flatMap((file) =>
        deletesInHooks(fs.readFileSync(file, "utf8")).map(
          (line) => `${path.relative(tests, file)}:${line}`,
        ),
      );
    expect(found).toEqual([]);
  });

  it("finds the hooks #870 removed", () => {
    // As they were: each failed a Windows run with "Hook timed out in 10000ms".
    expect(
      deletesInHooks(
        "let base = '';\n\nafterAll(() => {\n  if (base) fs.rmSync(base, { recursive: true, force: true });\n});\n",
      ),
    ).toEqual([3]);
    expect(
      deletesInHooks(
        "afterAll(() => {\n  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });\n});\n",
      ),
    ).toEqual([1]);
  });

  it("finds the other spellings of a delete in either hook", () => {
    expect(
      deletesInHooks(
        "afterEach(async () => {\n  await fs.promises.rm(dir, { recursive: true });\n});",
      ),
    ).toEqual([1]);
    expect(deletesInHooks("afterAll(() => fs.rmdirSync(dir));")).toEqual([1]);
    expect(deletesInHooks("afterEach(() => { fs.unlinkSync(file); });")).toEqual([1]);
  });

  it("leaves deletes outside the hooks, and hooks that delete nothing, alone", () => {
    expect(
      deletesInHooks('it("removes", () => { fs.rmSync(cache, { recursive: true }); });'),
    ).toEqual([]);
    expect(deletesInHooks("afterAll(() => { server.close(); });\nfs.rmSync(x);")).toEqual([]);
    // A parenthesis inside a string does not end the hook early, or hide a delete after it.
    expect(deletesInHooks('afterAll(() => { log(")"); fs.rmSync(dir); });')).toEqual([1]);
  });
});
