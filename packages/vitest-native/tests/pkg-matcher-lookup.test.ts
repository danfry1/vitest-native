/**
 * buildPkgMatcher answers by lookup: the package after each `node_modules` segment, and the
 * file's parent directories against the resolved package directories. It is called on
 * every file Node resolves or loads, so it must give packagePatterns' answers without a
 * test per package.
 */
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { buildPkgMatcher, packagePatterns } from "../src/native/match.mjs";

const root = "/work/app";
// Linked packages (outside every node_modules) resolve to their real directories; one
// package's directory contains the project, so it gets no directory rule.
const dirs: Record<string, string | null> = {
  "linked-lib": "/work/packages/linked-lib",
  "@acme/widgets": "/work/packages/widgets/",
  "contains-root": "/work",
};
const dirOf = (name: string) => dirs[name] ?? `${root}/node_modules/${name}`;

/** The matcher as it was: every package's patterns, tested one by one. */
const oracle = (pkgs: string[]) => {
  const patterns = pkgs.flatMap((name) => packagePatterns(name, root, dirOf));
  return (file: string) => patterns.some((re: RegExp) => re.test(file.replace(/\\/g, "/")));
};

const pkgs = [
  "some-lib",
  "expo",
  "@acme/widgets",
  "@scope/other",
  "linked-lib",
  "contains-root",
  "deep/subpath",
];
const files = [
  "/work/app/node_modules/some-lib/index.js",
  "/work/app/node_modules/some-lib",
  "/work/app/node_modules/some-library/index.js",
  "/work/app/node_modules/@acme/widgets/lib/a.js",
  "/work/app/node_modules/@acme/widgets-extra/a.js",
  "/work/app/node_modules/@acme/index.js",
  "/work/app/node_modules/expo/node_modules/some-lib/x.js",
  "/work/app/node_modules/other/node_modules/@scope/other/x.js",
  "/work/app/node_modules/node_modules/expo/x.js",
  "/work/app/src/some-lib/index.js",
  "/work/app/src/expo/index.ts",
  "/work/packages/linked-lib/index.js",
  "/work/packages/linked-lib",
  "/work/packages/linked-lib-2/index.js",
  "/work/packages/widgets/src/a.tsx",
  "/work/packages/other/a.js",
  "/work/app/node_modules/deep/subpath/a.js",
  "/work/app/node_modules/deep/other/a.js",
  "C:\\work\\app\\node_modules\\some-lib\\index.js",
  "C:\\work\\app\\node_modules\\@acme\\widgets\\a.js",
  "relative/node_modules/expo/a.js",
];

describe("buildPkgMatcher by lookup", () => {
  it("gives packagePatterns' answer for every file", () => {
    const lookup = buildPkgMatcher(pkgs, root, dirOf);
    const expected = oracle(pkgs);
    for (const file of files) expect([file, lookup(file)]).toEqual([file, expected(file)]);
  });

  it("gives packagePatterns' answer on generated paths (seeded)", () => {
    // A small deterministic generator (mulberry32), so a failure reproduces.
    let seed = 0x5eed;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
    const names = ["a.b", "some-lib", "@acme/widgets", "@s", "x/y", "linked-lib", "expo", "a"];
    const segments = [
      "node_modules",
      "@acme",
      "widgets",
      "a.b",
      "a",
      "aXb",
      "some-lib",
      "expo",
      "src",
      "packages",
      "linked-lib",
      "work",
      "app",
      "index.js",
      "x",
      "y",
      "@s",
    ];
    const prefixes = ["/", "/work/", "C:\\", "//server/share/", "\0/"];
    const suffixes = ["", "/", "?v=1", "#h", "/index.js"];
    const lookup = buildPkgMatcher(names, root, dirOf);
    const expected = oracle(names);
    for (let i = 0; i < 2000; i++) {
      const depth = 1 + Math.floor(random() * 6);
      const parts = Array.from({ length: depth }, () => pick(segments));
      const sep = random() < 0.2 ? "\\" : "/";
      const file = pick(prefixes) + parts.join(sep) + pick(suffixes);
      expect([file, lookup(file)]).toEqual([file, expected(file)]);
    }
  });

  it("makes the same number of RegExp calls per file however many packages it knows", () => {
    // Every RegExp test or exec the matcher performs (String#replace with a RegExp calls
    // exec as well), counted while it checks the same files.
    const many = [...pkgs, ...Array.from({ length: 1000 }, (_, i) => `pkg-${i}`)];
    const count = (matcher: (file: string) => boolean) => {
      const test = vi.spyOn(RegExp.prototype, "test");
      const exec = vi.spyOn(RegExp.prototype, "exec");
      try {
        for (const file of files) matcher(file);
        return test.mock.calls.length + exec.mock.calls.length;
      } finally {
        test.mockRestore();
        exec.mockRestore();
      }
    };
    const few = count(buildPkgMatcher(pkgs, root, dirOf));
    expect(count(buildPkgMatcher(many, root, dirOf))).toBe(few);
    // The old matcher, for scale: it tested every package's patterns.
    expect(count(oracle(many))).toBeGreaterThan(few * 100);
  });
});
