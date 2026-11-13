import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { errorIndex } from "../../../website/.vitepress/error-index.ts";
import { findErrors, queryWords } from "../../../website/.vitepress/error-search.ts";

// The "find your error" box on the errors and troubleshooting pages searches an index read
// from both pages at build time (website/.vitepress/error-index.ts). Every entry must be in
// it, link to an anchor that exists, and be found by the messages a reader pastes.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ERRORS = path.join(repoRoot, "website/guide/errors.md");
const TROUBLESHOOTING = path.join(repoRoot, "website/guide/troubleshooting.md");
const CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

const headings = (file: string, level: string) =>
  fs
    .readFileSync(file, "utf8")
    .replace(/^(```|~~~)[\s\S]*?^\1/gm, "")
    .split("\n")
    .filter((line) => line.startsWith(`${level} `));
const idOf = (heading: string) => /\{#([^}]+)\}\s*$/.exec(heading)?.[1];

describe("the error finder's index", () => {
  const index = errorIndex();

  it("holds every error code, linked by its anchor", () => {
    const codes = headings(ERRORS, "###").map(idOf);
    expect(codes.length).toBeGreaterThan(40);
    const indexed = index.filter((entry) => entry.kind === "Error code");
    expect(indexed.map((entry) => entry.link)).toEqual(codes.map((id) => `/guide/errors#${id}`));
    for (const entry of indexed) {
      expect(entry.title).toMatch(CODE);
      expect(entry.group, entry.title).not.toBe("");
      expect(entry.text.length, entry.title).toBeGreaterThan(40);
    }
  });

  it("holds every troubleshooting entry that is not only a pointer to its code", () => {
    const entries = headings(TROUBLESHOOTING, "##");
    // Each has an explicit id, so editing its heading cannot move a link to it.
    for (const heading of entries) expect(idOf(heading), heading).toBeDefined();
    const indexed = index.filter((entry) => entry.kind === "Troubleshooting");
    const coded = entries.filter((heading) => /`[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+`/.test(heading));
    expect(indexed.map((entry) => entry.link).sort()).toEqual(
      entries
        .filter((heading) => !coded.includes(heading) && idOf(heading) !== "still-stuck")
        .map((heading) => `/guide/troubleshooting#${idOf(heading)}`)
        .sort(),
    );
  });

  it("finds a coded problem once, at its error code", () => {
    // A troubleshooting entry about a code points to the code's entry instead of repeating it.
    const page = fs.readFileSync(TROUBLESHOOTING, "utf8");
    for (const [, code, body] of page.matchAll(/^## `([A-Z][A-Z0-9_]+)`[^\n]*\n\n([^\n]*)/gm)) {
      expect(body, code).toMatch(new RegExp(`^See \\[\`${code}\`\\]\\(/guide/errors#${code}\\)`));
    }
  });

  it("stops the build on an entry without an id", () => {
    expect(() => errorIndex("# Errors\n\n## Setup\n\n### `SOME_CODE`\n\nText.", "")).toThrow(
      /has no \{#id\}/,
    );
  });

  it("keeps codes and words, and drops Markdown", () => {
    const [entry] = errorIndex(
      "## Setup\n\n### `A_CODE` {#A_CODE}\n\nSee **[`findBy*`](/x)** and _this_ `B_CODE`.\n\n```ts\n# not a heading\n```\n",
      "",
    );
    expect(entry).toMatchObject({ title: "A_CODE", link: "/guide/errors#A_CODE", group: "Setup" });
    expect(entry.text).toBe("See findBy* and this B_CODE.");
  });
});

describe("the error finder's search", () => {
  const index = errorIndex();
  const first = (query: string) => findErrors(index, query)[0]?.link;

  it("finds a code anywhere in a pasted message, first", () => {
    expect(first("Error: [vitest-native] UNSUPPORTED_PEER vitest 4.1.0 is outside the range")).toBe(
      "/guide/errors#UNSUPPORTED_PEER",
    );
  });

  it("finds an entry whose heading the message quotes", () => {
    expect(
      first(
        "Warning: Invalid hook call. Hooks can only be called inside of the body of a function component.",
      ),
    ).toBe("/guide/troubleshooting#invalid-hook-call-warnings-in-test-output");
    expect(
      first("Error: Cannot find module '/Users/me/app/packages/ui/dist/index.js' imported from x"),
    ).toBe("/guide/troubleshooting#cannot-find-module-keeps-failing-after-the-missing-file-exists");
  });

  it("finds an entry by its words", () => {
    expect(
      first("FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory"),
    ).toBe(
      "/guide/troubleshooting#worker-terminated-due-to-reaching-memory-limit-js-heap-out-of-memory",
    );
    expect(first("fake timers waitFor")).toBe(
      "/guide/troubleshooting#findby-or-waitfor-times-out-under-vi-usefaketimers",
    );
  });

  it("finds nothing for a message the pages do not cover", () => {
    expect(
      findErrors(index, "TypeError: Cannot read properties of undefined (reading 'flatten')"),
    ).toEqual([]);
    expect(findErrors(index, "   ")).toEqual([]);
  });

  it("matches whole words, not a path or the prefix", () => {
    expect(queryWords("[vitest-native] in /Users/me/app/src/a.test.ts: already")).toEqual([
      "already",
    ]);
    expect(findErrors([{ title: "Other", text: "it was already loaded" }], "read")).toEqual([]);
  });
});
