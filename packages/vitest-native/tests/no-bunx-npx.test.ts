/**
 * No bunx or npx anywhere the repository runs commands: package.json scripts, workflows
 * and local actions, and the repository's own scripts. Either one fetches a tool it cannot
 * find installed at its latest release, and runs it: `bunx oxfmt` in a worktree without
 * node_modules ran an unpinned oxfmt, and the build's `bunx --bun tsdown` would have
 * fetched tsdown. Tools run through `bun run` or ./node_modules/.bin, from the lockfile.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const tracked = (...patterns: string[]) =>
  execFileSync("git", ["ls-files", "--", ...patterns], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), "utf8");

/** A command that fetches what it cannot find: bunx, npx and their spelled-out forms. */
const FETCHING =
  /(?:^|[\s"'`;&|(])(?:bunx|npx|bun\s+x|npm\s+exec|pnpm\s+dlx|yarn\s+dlx)(?=[\s"'`]|$)/;

/**
 * The pinned fetches still allowed, each a tool the lockfile does not have. Each needs a
 * decision (a dev dependency, or an integrity-checked tarball as in
 * .github/scripts/install-global.mjs) before it can go. May only shrink.
 */
const ALLOWED: Record<string, { count: number; reason: string }> = {
  "packages/vitest-native/scripts/check-exports.mjs": {
    count: 1,
    reason: "npx --yes @arethetypeswrong/cli@0.18.5, pinned; not in the lockfile",
  },
  "packages/vitest-native/scripts/test-consumers.mjs": {
    count: 1,
    reason: "npx --yes pnpm@10.34.9 for the pnpm-layout fixtures, pinned; not in the lockfile",
  },
  "packages/vitest-native/validation/config-axes/run.mjs": {
    count: 1,
    reason: "npx --yes pnpm@10.34.7 (sh.mjs's PNPM) for the pnpm axis, pinned; not in the lockfile",
  },
};

/** Lines that are not comments, in a script or YAML file. */
const codeLines = (text: string) =>
  text.split("\n").filter((line) => !/^\s*(\/\/|\/\*|\*|#)/.test(line));

describe("bunx and npx", () => {
  it("are not used by any package.json script", () => {
    const found: string[] = [];
    for (const file of tracked("package.json", "**/package.json")) {
      const scripts: Record<string, string> = JSON.parse(read(file)).scripts ?? {};
      for (const [name, command] of Object.entries(scripts))
        if (FETCHING.test(command)) found.push(`${file} ${name}: ${command}`);
    }
    expect(found).toEqual([]);
  });

  it("are not run by any workflow or local action", () => {
    const found = tracked(".github/workflows/*.yml", ".github/actions/**/*.yml").flatMap((file) =>
      codeLines(read(file))
        .filter((line) => FETCHING.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );
    expect(found).toEqual([]);
  });

  it("are not run by the repository's scripts, beyond the listed pinned fetches", () => {
    const counts: Record<string, number> = {};
    for (const file of tracked(
      ".github/scripts/*",
      "packages/vitest-native/scripts/**",
      "packages/vitest-native/validation/**/*.mjs",
      "packages/vitest-native/consumer-tests/**/*.mjs",
      "scripts/**",
    )) {
      if (!/\.(mjs|cjs|js|ts|mts|sh)$/.test(file)) continue;
      // A command string for spawn or exec: "npx" as a value, or a shell line using it.
      const hits = codeLines(read(file)).filter(
        (line) => /["'`](?:bunx|npx)["'`]/.test(line) || FETCHING.test(line.replace(/\/\/.*$/, "")),
      ).length;
      if (hits) counts[file] = hits;
    }
    const allowed = Object.fromEntries(Object.entries(ALLOWED).map(([f, { count }]) => [f, count]));
    expect(counts).toEqual(allowed);
  });
});
