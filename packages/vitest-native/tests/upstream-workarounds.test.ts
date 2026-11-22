/**
 * docs/upstream-workarounds.md: every registered workaround has its upstream issue, its
 * affected versions, its code, and a need and an expiry test (docs/upstream-policy.md).
 * The registry may be empty; the rules below run on every row it has, and on samples.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { atOrAfter, stillNeeded } from "./support/upstream-expiry";

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = path.join(PACKAGE, "docs/upstream-workarounds.md");

/** The rows of the "Workarounds" table, as arrays of trimmed cells. */
export function workaroundRows(markdown: string): string[][] {
  const section = markdown.split(/^## Workarounds\s*$/m)[1] ?? "";
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2) // header and separator
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

/** What is wrong with one row, or nothing. */
export function rowProblems(row: string[], exists: (file: string) => boolean): string[] {
  const [issue, pkg, affected, fixedIn, where, need, expiry, effect] = row;
  const problems: string[] = [];
  const file = (cell: string | undefined) => /`([^`]+)`/.exec(cell ?? "")?.[1];
  if (!/\[[^\]]+#\d+\]\(https:\/\/github\.com\/[^)]+\/(issues|pull)\/\d+\)/.test(issue ?? ""))
    problems.push("upstream issue is not a GitHub link");
  if (!pkg) problems.push("no package");
  if (!affected) problems.push("no affected versions");
  if (!fixedIn) problems.push("no fixed-in version (write 'unreleased' if there is none yet)");
  for (const [name, cell] of [
    ["source", where],
    ["need test", need],
    ["expiry test", expiry],
  ] as const) {
    const target = file(cell);
    if (!target) problems.push(`no ${name} file`);
    else if (!exists(target)) problems.push(`${name} ${target} does not exist`);
  }
  if (!effect) problems.push("no effect");
  return problems;
}

describe("the upstream workaround registry", () => {
  it("has a complete row for every workaround", () => {
    const rows = workaroundRows(fs.readFileSync(REGISTRY, "utf8"));
    for (const row of rows) {
      expect([row[0], rowProblems(row, (f) => fs.existsSync(path.join(PACKAGE, f)))]).toEqual([
        row[0],
        [],
      ]);
    }
  });

  it("reads a complete sample row as complete, and names what an incomplete one lacks", () => {
    const sample = workaroundRows(
      "## Workarounds\n\n| a | b |\n|---|---|\n" +
        "| [vitest-dev/vitest#11682](https://github.com/vitest-dev/vitest/issues/11682) | vitest | >=5.0.0 <5.1.0 | 5.1.0 | `src/a.ts` (`f`) | `tests/need.test.ts` | `tests/expiry.test.ts` | Errors hidden. |\n" +
        "| vitest#1 | vitest | | | `src/missing.ts` | | `tests/expiry.test.ts` | |\n",
    );
    const exists = (f: string) => f !== "src/missing.ts";
    expect(rowProblems(sample[0], exists)).toEqual([]);
    expect(rowProblems(sample[1], exists)).toEqual([
      "upstream issue is not a GitHub link",
      "no affected versions",
      "no fixed-in version (write 'unreleased' if there is none yet)",
      "source src/missing.ts does not exist",
      "no need test file",
      "no effect",
    ]);
  });
});

describe("stillNeeded (expiry tests)", () => {
  const peers = [{ name: "vitest", minimum: "5.0.0" }];

  it("passes while the floor is below the fix, and fails once it includes it", () => {
    expect(() => stillNeeded("vitest", "5.1.0", peers)).not.toThrow();
    expect(() => stillNeeded("vitest", "5.0.0", peers)).toThrow(/delete the workaround/);
    expect(() => stillNeeded("vite", "8.0.0", peers)).toThrow(/no peer requirement/);
  });

  it("compares release versions", () => {
    expect(atOrAfter("5.10.0", "5.9.9")).toBe(true);
    expect(atOrAfter("5.0.5", "5.1.0")).toBe(false);
    expect(atOrAfter("5.1.0", "5.1.0")).toBe(true);
  });
});
