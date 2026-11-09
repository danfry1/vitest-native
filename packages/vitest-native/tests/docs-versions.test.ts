import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A page said a fix shipped "from 0.14.2", a release that was never cut: the fix went into
// 0.15.0. Every vitest-native version the docs name has to be one that exists: a release in
// CHANGELOG.md, the version in package.json (a release candidate), or the release that
// candidate leads to. A candidate of an earlier release is checked against that release.
// Released versions come from CHANGELOG.md, not git tags, which a shallow checkout lacks.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PACKAGE = path.join(repoRoot, "packages/vitest-native");
const CHANGELOG = path.join(PACKAGE, "CHANGELOG.md");

// vitest-native's versions are 0.x with a small minor; React Native's (0.86) and Metro's
// (0.87) are not. Other packages' versions with a small minor are named here, by the text
// that comes before them.
const VERSION = /\b0\.([0-9]|[1-4][0-9])\.(\d+)(?:-rc\.(\d+))?\b/g;
const OTHER_PACKAGES = [/worklets $/];
/** `react-refresh@0.14.2` is another package's version; `vitest-native@0.15.0` is ours. */
const otherPackage = (before: string) => {
  const spec = /([\w@/.-]+)@$/.exec(before)?.[1];
  return (
    (spec !== undefined && !spec.endsWith("vitest-native")) ||
    OTHER_PACKAGES.some((pattern) => pattern.test(before))
  );
};

function existingVersions() {
  const released = new Set(
    [...fs.readFileSync(CHANGELOG, "utf8").matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1]),
  );
  const current: string = JSON.parse(
    fs.readFileSync(path.join(PACKAGE, "package.json"), "utf8"),
  ).version;
  const [next, rc] = current.split("-rc.");
  return { released, current, next, currentRc: rc === undefined ? null : Number(rc) };
}

function exists(version: string, known = existingVersions()): boolean {
  const [base, rc] = version.split("-rc.");
  if (base === known.next) {
    // A candidate of the coming release exists up to the current one.
    return rc === undefined || known.currentRc === null || Number(rc) <= known.currentRc;
  }
  return known.released.has(base);
}

/** The vitest-native versions a page names, with the text before each. */
function versionsIn(text: string): { version: string; before: string }[] {
  return [...text.matchAll(VERSION)]
    .map((m) => ({ version: m[0], before: text.slice(Math.max(0, m.index - 40), m.index) }))
    .filter(({ before }) => !otherPackage(before));
}

const docs = execFileSync("git", ["ls-files", "*.md", "*.mdx", "*.vue", "website/public/*.txt"], {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => file && path.basename(file) !== "CHANGELOG.md");

describe("vitest-native versions named in the docs", () => {
  it("are releases, the current candidate or the release it leads to", () => {
    const named = docs.flatMap((file) =>
      versionsIn(fs.readFileSync(path.join(repoRoot, file), "utf8")).map((found) => ({
        file,
        ...found,
      })),
    );
    // The scan finds the docs' versions: the museum and the perf notes name several.
    expect(named.length).toBeGreaterThan(10);
    const missing = named.filter(({ version }) => !exists(version));
    expect(missing.map(({ file, version, before }) => `${file}: …${before}${version}`)).toEqual([]);
  });

  it("knows which versions exist", () => {
    const known = {
      released: new Set(["0.13.0", "0.14.0", "0.14.1"]),
      current: "0.15.0-rc.2",
      next: "0.15.0",
      currentRc: 2,
    };
    expect(exists("0.14.1", known)).toBe(true);
    expect(exists("0.14.0-rc.11", known)).toBe(true);
    expect(exists("0.15.0", known)).toBe(true);
    expect(exists("0.15.0-rc.2", known)).toBe(true);
    expect(exists("0.14.2", known)).toBe(false);
    expect(exists("0.15.0-rc.3", known)).toBe(false);
    expect(exists("0.15.1", known)).toBe(false);
    expect(exists("0.16.0", known)).toBe(false);
  });

  it("reads only vitest-native's versions", () => {
    const versions = (text: string) => versionsIn(text).map(({ version }) => version);
    expect(versions("from 0.14.2 it takes effect")).toEqual(["0.14.2"]);
    expect(versions("vitest-native@0.15.0-rc.1")).toEqual(["0.15.0-rc.1"]);
    expect(versions("main pins worklets 0.13.1")).toEqual([]);
    expect(versions("react-refresh@0.14.2, React Native 0.86.0, Metro 0.87.3")).toEqual([]);
  });
});
