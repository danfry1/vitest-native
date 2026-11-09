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
// (0.87) are not. A version is not part of a longer number (`127.0.0.1`), and may follow a
// `v`. `0.14.x` names a minor.
const VERSION = /(?<![\d.])0\.([0-9]|[1-4][0-9])\.(\d+|x)(?:-rc\.(\d+))?(?!\.?\d)/g;
// Other packages with a small 0.x minor, named by the word before their version.
const OTHER_PACKAGES =
  /\b(?:worklets|tsdown|oxfmt|oxlint|esbuild|scheduler|hermes-parser|metro[\w-]*|react-refresh) v?$/i;
/** Another package's version: `react-refresh@^0.14.2`, `"react-refresh": "0.14.2"`, `tsdown 0.16`. */
function otherPackage(before: string): boolean {
  const spec =
    /([\w@/.-]+)@[\^~]?v?$/.exec(before)?.[1] ?? /"([\w@/.-]+)":\s*"[\^~]?$/.exec(before)?.[1];
  if (spec !== undefined) return !spec.endsWith("vitest-native");
  return OTHER_PACKAGES.test(before);
}

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

type Known = ReturnType<typeof existingVersions>;

/** The releases a page may name: those released, and the coming one. */
function releases(known: Known): Set<string> {
  const all = new Set([...known.released, known.next]);
  if (known.currentRc === null) {
    // Between releases, the next one is not decided: a page may name the next patch or minor.
    const [, minor, patch] = known.next.split(".").map(Number);
    all.add(`0.${minor}.${patch + 1}`);
    all.add(`0.${minor + 1}.0`);
  }
  return all;
}

function exists(version: string, known: Known = existingVersions()): boolean {
  const [base, rc] = version.split("-rc.");
  const all = releases(known);
  if (base.endsWith(".x")) return [...all].some((release) => release.startsWith(base.slice(0, -1)));
  if (!all.has(base)) return false;
  // A candidate of the coming release exists up to the current one. An earlier release's
  // candidates are not listed anywhere a shallow checkout can read, so its base is checked.
  if (rc !== undefined && base === known.next && known.currentRc !== null)
    return Number(rc) <= known.currentRc;
  return true;
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
    const candidate = {
      released: new Set(["0.13.0", "0.14.0", "0.14.1"]),
      current: "0.15.0-rc.2",
      next: "0.15.0",
      currentRc: 2,
    };
    for (const version of ["0.14.1", "0.14.0-rc.11", "0.15.0", "0.15.0-rc.2", "0.14.x", "0.15.x"])
      expect(exists(version, candidate), version).toBe(true);
    for (const version of ["0.14.2", "0.15.0-rc.3", "0.15.1", "0.16.0", "0.16.x", "0.12.0"])
      expect(exists(version, candidate), version).toBe(false);

    // After 0.15.0: its candidates exist, and a page may name 0.15.1 or 0.16.0.
    const released = {
      released: new Set(["0.14.1", "0.15.0"]),
      current: "0.15.0",
      next: "0.15.0",
      currentRc: null,
    };
    for (const version of ["0.15.0-rc.9", "0.15.1", "0.16.0", "0.16.x"])
      expect(exists(version, released), version).toBe(true);
    for (const version of ["0.15.2", "0.17.0"])
      expect(exists(version, released), version).toBe(false);
  });

  it("reads only vitest-native's versions", () => {
    const versions = (text: string) => versionsIn(text).map(({ version }) => version);
    expect(versions("from 0.14.2 it takes effect.")).toEqual(["0.14.2"]);
    expect(versions("vitest-native@0.15.0-rc.1 and v0.14.2, on 0.14.x")).toEqual([
      "0.15.0-rc.1",
      "0.14.2",
      "0.14.x",
    ]);
    expect(versions('"vitest-native": "^0.14.1"')).toEqual(["0.14.1"]);
    expect(versions("main pins worklets 0.13.1; tsdown 0.16.4; oxfmt v0.30.0")).toEqual([]);
    expect(versions('react-refresh@^0.14.2, "react-refresh": "0.14.2"')).toEqual([]);
    expect(versions("React Native 0.86.0, Metro 0.87.3, 127.0.0.1, 0.0.0.0, 10.14.2")).toEqual([]);
  });
});
