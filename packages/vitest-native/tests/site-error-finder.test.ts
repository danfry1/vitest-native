import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { errorIndex, plain } from "../../../website/.vitepress/error-index.ts";
import { findErrors, queryWords, searchable } from "../../../website/.vitepress/error-search.ts";

// The "find your error" box on the errors and troubleshooting pages searches an index read
// from both pages at build time (website/.vitepress/error-index.ts). Every entry must be in
// it, link to an anchor that exists, and be found by the messages vitest-native throws.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = path.join(repoRoot, "packages/vitest-native/src");
const ERRORS = path.join(repoRoot, "website/guide/errors.md");
const TROUBLESHOOTING = path.join(repoRoot, "website/guide/troubleshooting.md");
const FINDER = path.join(repoRoot, "website/.vitepress/theme/components/ErrorFinder.vue");
const CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
// An entry that only sends the reader to an error code's entry.
const POINTER = /^See \[`([A-Z][A-Z0-9_]+)`\]\(\/guide\/errors#\1\)/;

/** A page's headings at one level, with the paragraph after each. */
function sections(file: string, level: string) {
  const text = fs.readFileSync(file, "utf8").replace(/^(```|~~~)[\s\S]*?^\1/gm, "");
  return [...text.matchAll(new RegExp(`^${level} (.*)\\n\\n([^\\n]*)`, "gm"))].map(
    ([, heading, first]) => ({ heading, id: /\{#([^}]+)\}\s*$/.exec(heading)?.[1], first }),
  );
}

describe("the error finder's index", () => {
  const index = errorIndex();

  it("holds every error code, linked by its anchor, with its own text only", () => {
    const codes = sections(ERRORS, "###");
    expect(codes.length).toBeGreaterThan(40);
    const indexed = index.filter((entry) => entry.kind === "Error code");
    expect(indexed.map((entry) => entry.link)).toEqual(
      codes.map(({ id }) => `/guide/errors#${id}`),
    );
    for (const entry of indexed) {
      expect(entry.title).toMatch(CODE);
      expect(entry.group, entry.title).not.toBe("");
      // The text starts as the entry's first paragraph does, and the page's closing line is
      // not part of the last entry.
      const first = codes.find(({ id }) => entry.link.endsWith(`#${id}`))!.first;
      expect(entry.text.startsWith(plain(first).slice(0, 30)), entry.title).toBe(true);
      expect(entry.text, entry.title).not.toMatch(/Next: /);
    }
  });

  it("holds every troubleshooting entry that does not only point to an error code", () => {
    const entries = sections(TROUBLESHOOTING, "##");
    // Each has an explicit id, so editing its heading cannot move a link to it.
    for (const { heading, id } of entries) expect(id, heading).toBeDefined();
    const indexed = index.filter((entry) => entry.kind === "Troubleshooting");
    expect(indexed.map((entry) => entry.link).sort()).toEqual(
      entries
        .filter(({ id, first }) => id !== "still-stuck" && !POINTER.test(first))
        .map(({ id }) => `/guide/troubleshooting#${id}`)
        .sort(),
    );
  });

  it("finds a coded problem once, at its error code", () => {
    // A troubleshooting entry about a code points to the code's entry instead of repeating it.
    for (const { heading, first } of sections(TROUBLESHOOTING, "##")) {
      const code = /`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/.exec(heading)?.[1];
      if (code) expect(POINTER.exec(first)?.[1], heading).toBe(code);
    }
    // The box's "Still stuck?" link, and the entry the index leaves out by that id.
    expect(fs.readFileSync(FINDER, "utf8")).toContain("/guide/troubleshooting#still-stuck");
    expect(sections(TROUBLESHOOTING, "##").map(({ id }) => id)).toContain("still-stuck");
  });

  it("stops the build on an entry without an id", () => {
    expect(() => errorIndex("# Errors\n\n## Setup\n\n### `SOME_CODE`\n\nText.", "")).toThrow(
      /has no \{#id\}/,
    );
  });

  it("reads Markdown as the words a reader sees", () => {
    expect(
      plain(
        "See **[`findBy*`](/x)** and _this_ `B_CODE`, `__mocks__` and `Array<string>`.\n\n" +
          "- a <b>list</b> item\n\n```ts\n# not a heading\n```\n\nNext: [Troubleshooting](/t).",
      ),
    ).toBe("See findBy* and this B_CODE, __mocks__ and Array<string>. a list item");
  });
});

describe("the error finder's search", () => {
  const entry = (title: string, text: string) => ({ title, text });

  it("finds a code first, even one whose words the text does not contain", () => {
    const index = [entry("Other", "a mismatch in the config"), entry("ZQX_UNRELATED", "nothing")];
    expect(findErrors(index, "config mismatch, ZQX_UNRELATED")[0]).toBe(index[1]);
    // The start of a code, as it is typed.
    expect(findErrors(index, "ZQX_UNR")).toEqual([index[1]]);
  });

  it("puts an entry whose heading the message quotes first, and keeps the others", () => {
    const quoted = entry('"Cannot find module" after a rebuild', "the cache keeps a missing file");
    const other = entry("A missing module", "cannot find module packages that are not installed");
    const results = findErrors([other, quoted], "Error: Cannot find module 'react-native-foo'");
    expect(results).toEqual([quoted, other]);
  });

  it("matches a plural to its singular, both ways", () => {
    const hooks = entry("Module hooks", "loads through hooks");
    const hook = entry("Invalid hook call", "a hook outside a component");
    expect(findErrors([hooks], "hook")).toEqual([hooks]);
    expect(findErrors([hook], "hooks")).toEqual([hook]);
  });

  it("finds an entry by a word of its code", () => {
    const index = [entry("SOURCE_EVALUATED_TWICE", "Vite and Node both load a file.")];
    expect(findErrors(index, "evaluated twice")).toEqual(index);
  });

  it("ranks an entry with more of the words first", () => {
    const index = [
      entry("Coverage", "the config and the coverage report"),
      entry("Other", "the heap and the config"),
      entry("Memory", "the worker's heap"),
    ];
    // `heap` is in two entries and `config` in two, but only `Other` has both.
    expect(findErrors(index, "config heap watcher")[0]).toBe(index[1]);
  });

  it("counts a word in the heading twice", () => {
    const index = [entry("Other", "about the heap"), entry("Heap", "about memory")];
    expect(findErrors(index, "heap")[0]).toBe(index[1]);
  });

  it("leaves out common words, paths and words with digits", () => {
    expect(
      queryWords(
        "[vitest-native] the test in /Users/me/app/src/a.test.ts: vitest 4.1.0 500ms already",
      ),
    ).toEqual(["already"]);
    expect(searchable("Th")).toBe(false);
    expect(searchable("UNSUPP_")).toBe(true);
  });

  it("matches whole words only", () => {
    expect(findErrors([entry("Other", "it was already loaded")], "read")).toEqual([]);
  });

  it("finds nothing for a message the pages do not cover", () => {
    const index = errorIndex();
    expect(
      findErrors(index, "TypeError: Cannot read properties of undefined (reading 'flatten')"),
    ).toEqual([]);
    expect(findErrors(index, "   ")).toEqual([]);
  });
});

describe("the error finder on the messages vitest-native throws", () => {
  // Every `new VitestNativeError("CODE", "message")` in the source whose message is a string,
  // with each `${…}` as a word the pages cannot contain. A message rarely carries its code,
  // so this is what a reader pastes.
  function thrown(): { code: string; message: string }[] {
    const files = fs
      .readdirSync(SRC, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(m?ts|mjs)$/.test(file) && !/\.d\.m?ts$/.test(file));
    return files.flatMap((file) =>
      [
        ...fs
          .readFileSync(path.join(SRC, file), "utf8")
          .matchAll(
            /VitestNative(?:Type)?Error\(\s*"([A-Z][A-Z0-9_]+)",\s*(`[^`]*`|"(?:[^"\\]|\\.)*")/g,
          ),
      ].map(([, code, literal]) => ({
        code,
        message: `[vitest-native] ${literal
          .slice(1, -1)
          .replace(/\$\{[^}]*\}/g, "Placeholder")
          .replace(/\\n/g, " ")}`,
      })),
    );
  }

  it("ranks the message's own code first for most of them", () => {
    const index = errorIndex();
    const messages = thrown().filter(({ message }) => message.length > 40);
    expect(messages.length).toBeGreaterThan(80);
    const first = messages.filter(
      ({ code, message }) => findErrors(index, message)[0]?.link === `/guide/errors#${code}`,
    );
    // A floor, not a target: raise it when the pages or the search find more.
    expect(first.length / messages.length).toBeGreaterThan(0.65);
  });
});
