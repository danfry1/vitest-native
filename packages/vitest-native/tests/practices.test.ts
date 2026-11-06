import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The workflow skills in .claude/skills/ and the practices in CONTRIBUTING.md are checklists
// people and agents follow by name. A skill that names a file which no longer exists sends
// its reader to nothing, so every repository path they mention in backticks must resolve,
// and every skill must carry the front matter Claude Code reads it by.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SKILLS = path.join(repoRoot, ".claude/skills");
const PACKAGE = path.join(repoRoot, "packages/vitest-native");

const skillDirs = fs
  .readdirSync(SKILLS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** A backticked token that looks like a path in this repository: a slash, no spaces. */
function mentionedPaths(markdown: string): string[] {
  const tokens = [...markdown.matchAll(/`([^`\s]+)`/g)].map(([, token]) => token);
  return tokens.filter(
    (token) =>
      token.includes("/") &&
      !/^(https?:|@|\.\.|~|<)/.test(token) &&
      !/[<>*{}$|(),'"=]/.test(token) &&
      /(\.[a-z]+|\/)$/.test(token),
  );
}

/** A path resolves from the repository root or from the package, as the docs write both. */
const exists = (token: string) =>
  [repoRoot, PACKAGE].some((base) => fs.existsSync(path.join(base, token)));

describe("workflow skills", () => {
  it("finds the skills", () => {
    expect(skillDirs).toEqual(
      expect.arrayContaining([
        "changeset-style",
        "docs-claims",
        "fix-a-bug",
        "land-a-stack",
        "perf-measurement",
        "release-rc",
      ]),
    );
  });

  it.each(skillDirs)("%s has front matter naming it and saying when to use it", (dir) => {
    const text = fs.readFileSync(path.join(SKILLS, dir, "SKILL.md"), "utf8");
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
    expect(/^name: (.+)$/m.exec(front)?.[1]).toBe(dir);
    expect(/^description: (.+)$/m.exec(front)?.[1]?.length ?? 0).toBeGreaterThan(40);
  });

  it("CONTRIBUTING.md lists every skill", () => {
    const contributing = fs.readFileSync(path.join(repoRoot, "CONTRIBUTING.md"), "utf8");
    for (const dir of skillDirs) expect(contributing, dir).toContain(`\`${dir}\``);
  });

  it("names only paths that exist", () => {
    const sources = [
      path.join(repoRoot, "CONTRIBUTING.md"),
      ...skillDirs.map((dir) => path.join(SKILLS, dir, "SKILL.md")),
    ];
    const checked: string[] = [];
    const missing: string[] = [];
    for (const file of sources) {
      for (const token of mentionedPaths(fs.readFileSync(file, "utf8"))) {
        checked.push(`${path.relative(repoRoot, file)}: ${token}`);
        if (!exists(token)) missing.push(`${path.relative(repoRoot, file)}: ${token}`);
      }
    }
    expect(missing).toEqual([]);
    // Floors per source, so a skill that stops naming any file is noticed: CONTRIBUTING.md
    // names the files its practices rest on, and the skills together name at least as many.
    expect(checked.filter((t) => t.startsWith("CONTRIBUTING.md")).length).toBeGreaterThanOrEqual(8);
    expect(checked.filter((t) => !t.startsWith("CONTRIBUTING.md")).length).toBeGreaterThanOrEqual(
      12,
    );
  });
});
