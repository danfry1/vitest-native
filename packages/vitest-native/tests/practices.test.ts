import { execFileSync } from "node:child_process";
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

// `bunx` and `npx` fetch the latest release of a tool missing from node_modules and run it,
// unpinned, so the repository's tools run through `bun run` or ./node_modules/.bin/. No doc,
// skill, workflow or script message may tell anyone otherwise. Pages and messages for users
// keep `npx vitest-native` and `npx vitest`: those run in the reader's own project, which
// installed them.
describe("tool commands in docs", () => {
  // A runner's name, found by plain search; what comes before and after it is read below
  // without a regular expression that could backtrack.
  const RUNNER = /\b(?:bunx|npx|bun x|bun\tx)\b/g;
  // A command starts at a line's start (after `$`, `#`, `-` or `>`), or after a backtick, a
  // quote, `(`, `run:` or `&&`. Prose such as "bunx would download it" is not one.
  const OPENERS = ["`", "'", '"', "(", "run:", "&&"];
  function startsCommand(before: string): boolean {
    const text = before.trimEnd();
    if (text === "") return true;
    if ("$#>-".includes(text.slice(-1)) && text.slice(0, -1).trim() === "") return true;
    return OPENERS.some((opener) => text.endsWith(opener));
  }
  /** The flags and the tool after a runner: `--yes oxfmt .` gives `["--yes"]` and `oxfmt`. */
  function toolAfter(rest: string): { flags: string[]; tool: string } {
    const words = rest.split(/[ \t]/).filter(Boolean);
    const flags: string[] = [];
    while (words.length > 0 && words[0].startsWith("-")) flags.push(words.shift()!);
    const word = words[0] ?? "";
    let end = 0;
    while (end < word.length && /[\w@/.:-]/.test(word[end])) end++;
    return { flags, tool: word.slice(0, end) };
  }

  const USER_FACING = new RegExp(
    "^(" +
      [
        "website/",
        "README\\.md$",
        "packages/vitest-native/README\\.md$",
        "packages/vitest-native/docs/(compare-mode|migrating-from-jest|migrating-from-vitest-react-native)\\.md$",
        "packages/vitest-native/src/",
        "packages/vitest-native/scripts/test-consumers\\.mjs$",
      ].join("|") +
      ")",
  );
  // CONTRIBUTING.md and the release workflow explain why the build script runs tsdown under
  // bun; they quote the script, so they may name it while the script does.
  const buildScript: string = JSON.parse(
    fs.readFileSync(path.join(PACKAGE, "package.json"), "utf8"),
  ).scripts.build;
  const QUOTES_BUILD = new Set(["CONTRIBUTING.md", ".github/workflows/release.yml"]);

  const scanned = execFileSync(
    "git",
    [
      "ls-files",
      "*.md",
      "*.mdx",
      "*.vue",
      "*.yml",
      "*.yaml",
      "packages/vitest-native/scripts/",
      "packages/vitest-native/src/",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  )
    .split("\n")
    .filter(
      (file) =>
        file && !file.endsWith("CHANGELOG.md") && /\.(md|mdx|vue|ya?ml|[cm]?[jt]s)$/.test(file),
    );

  function commands(file: string, text: string) {
    return text.split("\n").flatMap((line) =>
      [...line.matchAll(RUNNER)].flatMap((match) => {
        const runner = match[0].replace("\t", " ");
        if (!startsCommand(line.slice(0, match.index))) return [];
        const { flags, tool } = toolAfter(line.slice(match.index + match[0].length));
        if (!/^[@\w]/.test(tool)) return [];
        const command = [runner, ...flags, tool].join(" ");
        return [
          {
            file,
            command,
            allowed:
              (QUOTES_BUILD.has(file) && buildScript.includes(command)) ||
              (runner === "npx" &&
                flags.length === 0 &&
                /^vitest(-native)?$/.test(tool) &&
                USER_FACING.test(file)),
          },
        ];
      }),
    );
  }

  it("tells no one to run a repository tool with bunx or npx", () => {
    const found = scanned.flatMap((file) =>
      fs.existsSync(path.join(repoRoot, file))
        ? commands(file, fs.readFileSync(path.join(repoRoot, file), "utf8"))
        : [],
    );
    expect(found.filter((c) => !c.allowed).map((c) => `${c.file}: ${c.command}`)).toEqual([]);
    // The scan sees what it should: the user pages' commands, the skills and the scripts.
    expect(found.filter((c) => c.allowed).length).toBeGreaterThan(20);
    expect(scanned).toContain(".claude/skills/release-rc/SKILL.md");
    expect(scanned).toContain("packages/vitest-native/scripts/check-changeset.mjs");
  });

  it("catches each form a doc could use", () => {
    const flagged = (file: string, text: string) =>
      commands(file, text)
        .filter((c) => !c.allowed)
        .map((c) => c.command);
    expect(flagged("CONTRIBUTING.md", "Run `bunx changeset`.")).toEqual(["bunx changeset"]);
    expect(flagged(".claude/skills/x/SKILL.md", "npx --yes oxfmt .")).toEqual(["npx --yes oxfmt"]);
    expect(flagged("CONTRIBUTING.md", "  $ bun x oxfmt")).toEqual(["bun x oxfmt"]);
    expect(flagged("CONTRIBUTING.md", "`npx --package=oxfmt oxfmt`")).toEqual([
      "npx --package=oxfmt oxfmt",
    ]);
    expect(flagged("website/guide/x.md", "`npx -p oxfmt vitest-native`")).toEqual(["npx -p oxfmt"]);
    expect(flagged("packages/vitest-native/scripts/x.mjs", '"  bunx changeset --empty"')).toEqual([
      "bunx changeset",
    ]);
    expect(flagged(".github/PULL_REQUEST_TEMPLATE.md", "`npx vitest-native init`")).toEqual([
      "npx vitest-native",
    ]);
    expect(flagged("packages/vitest-native/docs/perf.md", "`npx vitest run`")).toEqual([
      "npx vitest",
    ]);
    expect(flagged("website/guide/x.md", "`bunx vitest run`")).toEqual(["bunx vitest"]);
    expect(flagged("CONTRIBUTING.md", "`bunx --bun tsdown`")).toEqual([]);
    expect(flagged("CONTRIBUTING.md", "`bunx --bun tsc`")).toEqual(["bunx --bun tsc"]);
    expect(flagged("website/guide/x.md", "`npx vitest-native doctor`")).toEqual([]);
    expect(flagged("CONTRIBUTING.md", "and bunx would download it")).toEqual([]);
  });
});
