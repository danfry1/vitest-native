import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs outside the package, no types
import { LANES, globToRegExp, laneOf, lanesOf } from "../../../.github/scripts/lanes.mjs";

// agents/lanes.json says which lane owns each file, and AGENTS.md and the lane files in
// agents/lanes/ are what every agent reads before working here. These checks keep both
// true: every tracked file has exactly one owner, and every path the guide names exists.
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const packageRoot = path.join(repoRoot, "packages/vitest-native");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

type Lane = { name: string; globs: string[] };
const laneNames = (LANES.lanes as Lane[]).map((lane) => lane.name);

const guideFiles = [
  "AGENTS.md",
  ...fs.readdirSync(path.join(repoRoot, "agents/lanes")).map((file) => `agents/lanes/${file}`),
];
const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), "utf8");

describe("glob matching", () => {
  it("keeps * inside one path segment and lets ** cross segments", () => {
    expect(globToRegExp("src/*").test("src/plugin.ts")).toBe(true);
    expect(globToRegExp("src/*").test("src/native/loader.mjs")).toBe(false);
    expect(globToRegExp("src/**").test("src/native/loader.mjs")).toBe(true);
    expect(globToRegExp("*.md").test("README.md")).toBe(true);
    expect(globToRegExp("*.md").test("website/index.md")).toBe(false);
  });

  it("treats dots and other regex characters in a glob literally", () => {
    expect(globToRegExp("bun.lock").test("bunxlock")).toBe(false);
  });
});

describe("lane ownership", () => {
  it("gives every tracked file a lane, or marks it shared", () => {
    const unowned = tracked.filter((file) => laneOf(file) === undefined);
    expect(unowned).toEqual([]);
  });

  it("has no glob that matches nothing", () => {
    const dead = [...LANES.shared, ...(LANES.lanes as Lane[]).flatMap((lane) => lane.globs)].filter(
      (glob: string) => !tracked.some((file) => globToRegExp(glob).test(file)),
    );
    expect(dead).toEqual([]);
  });

  it("settles overlaps by order", () => {
    expect(laneOf("packages/vitest-native/src/native/boundary.mjs")).toBe("compat");
    expect(laneOf("packages/vitest-native/src/native/loader.mjs")).toBe("runtime");
    expect(laneOf("packages/vitest-native/src/preset-map.ts")).toBe("compat");
    expect(laneOf("packages/vitest-native/src/plugin.ts")).toBe("runtime");
    expect(laneOf("packages/vitest-native/package.json")).toBe("delivery");
    expect(laneOf("packages/vitest-native/README.md")).toBe("docs");
    expect(laneOf("packages/vitest-native/tests/plugin.test.ts")).toBe("shared");
  });

  it("lists the lanes a change touches, ignoring shared files", () => {
    expect(
      lanesOf([
        "packages/vitest-native/src/plugin.ts",
        "packages/vitest-native/tests/plugin.test.ts",
        "website/guide/plugin-options.md",
      ]),
    ).toEqual(["runtime"]);
    expect(lanesOf(["packages/vitest-native/src/cli/doctor.ts", "bun.lock"])).toEqual([
      "cli",
      "delivery",
    ]);
  });
});

describe("the agent guide", () => {
  it("lists exactly the lanes in agents/lanes.json, each with its own file", () => {
    const linked = [...read("AGENTS.md").matchAll(/\[(\w+)\]\(agents\/lanes\/(\w+)\.md\)/g)].map(
      (m) => m[1],
    );
    expect(linked).toEqual(laneNames);
    expect(
      guideFiles
        .filter((file) => file.startsWith("agents/lanes/"))
        .map((f) => path.basename(f, ".md"))
        .sort(),
    ).toEqual([...laneNames].sort());
  });

  it("names only paths that exist", () => {
    // Backticked tokens that look like paths. A leading `/` means the repository root;
    // otherwise a path is relative to packages/vitest-native, then to the root.
    const PATH = /`(\/?[\w.-]+(?:\/[\w.*{},-]*)+|[\w-]+\.(?:mjs|ts|json|md|yml|lock|sh))`/g;
    // Build output, ignored directories and git refs: named so agents know them, never tracked.
    const NOT_FILES = new Set(["dist/", ".vitest/", ".tmp/", "coverage/", "origin/main"]);
    const missing: string[] = [];
    for (const file of guideFiles) {
      for (const [, token] of read(file).matchAll(PATH)) {
        if (NOT_FILES.has(token)) continue;
        const fromRoot = token.startsWith("/");
        const clean = token.replace(/^\//, "").replace(/\/$/, "");
        const expanded = clean.includes("{")
          ? clean.replace(/\{([^}]*)\}/, "\0").split("\0").length === 2
            ? (clean.match(/\{([^}]*)\}/)?.[1] ?? "")
                .split(",")
                .map((part) => clean.replace(/\{[^}]*\}/, part.trim()))
            : [clean]
          : [clean];
        for (const candidate of expanded) {
          const bases = fromRoot ? [repoRoot] : [packageRoot, repoRoot];
          const found = candidate.includes("*")
            ? bases.some((base) => {
                const prefix = path.relative(repoRoot, base);
                const re = globToRegExp(prefix ? `${prefix}/${candidate}` : candidate);
                return tracked.some((f) => re.test(f));
              })
            : bases.some((base) => fs.existsSync(path.join(base, candidate))) ||
              tracked.some((f) => f.endsWith(`/${candidate}`) || f === candidate);
          if (!found) missing.push(`${file}: ${token}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps machine-specific and private paths out", () => {
    const leaks = guideFiles.flatMap((file) =>
      [...read(file).matchAll(/~\/|\/Users\/|\/private\/tmp|vitest-native-planning/g)].map(
        (m) => `${file}: ${m[0]}`,
      ),
    );
    expect(leaks).toEqual([]);
  });
});
