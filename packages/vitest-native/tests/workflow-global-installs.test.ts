/**
 * Every job installs a global tool (npm, corepack) through
 * .github/scripts/install-global.mjs, which checks the tarball against the integrity the
 * registry published for that release. A plain `npm install -g <name>@<version>`
 * resolves through the registry at run time, unchecked, and OpenSSF Scorecard reports
 * each one as an unpinned dependency. Seven steps in six workflows had their own before
 * this check.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { INTEGRITY, integrityOf } from "../../../.github/scripts/install-global.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

/** Every workflow and local action, as [repository path, text]. */
function workflowFiles(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.ya?ml$/.test(entry.name))
        out.push([rel, fs.readFileSync(path.join(repoRoot, rel), "utf8")]);
    }
  };
  walk(".github/workflows");
  walk(".github/actions");
  return out;
}

/** The text without YAML comment lines, so a comment never decides anything below. */
const code = (text: string) =>
  text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

describe("global installs in CI", () => {
  it("is never installed globally from the registry by a workflow or action", () => {
    const direct = workflowFiles().flatMap(([file, text]) =>
      [
        ...code(text).matchAll(/\bnpm\s+(?:i|install|add)\s+(?:[^\n]*\s)?(?:-g|--global)\b[^\n]*/g),
      ].map((m) => `${file}: ${m[0].trim()}`),
    );
    expect(direct).toEqual([]);
  });

  it("happens only at releases whose integrity is recorded", () => {
    const requested = new Set<string>();
    for (const [, text] of workflowFiles()) {
      const body = code(text);
      for (const m of body.matchAll(/install-global\.mjs\s+([\w@/.-]+)\s+"?(\d+\.\d+\.\d+)/g))
        requested.add(`${m[1]}@${m[2]}`);
      // The setup action's input, which installs npm.
      for (const m of body.matchAll(/npm-version:\s*([^\n]+)/g))
        for (const v of m[1].matchAll(/\d+\.\d+\.\d+/g)) requested.add(`npm@${v[0]}`);
    }
    expect(requested.size).toBeGreaterThanOrEqual(3);
    const missing = [...requested].filter((spec) => !(spec in INTEGRITY));
    expect(missing).toEqual([]);
  });

  it("compares integrities in the registry's form", () => {
    // sha512 of no bytes, as `npm view` would print it.
    expect(integrityOf(Buffer.alloc(0))).toBe(
      "sha512-z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==",
    );
    for (const value of Object.values(INTEGRITY) as string[]) {
      expect(value).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
    }
  });
});
