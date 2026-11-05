import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractSnippets, readSnippets, writeSnippets } from "../scripts/doc-snippets.mjs";

// The packed run (scripts/test-consumers.mjs) executes whatever blocks are marked, so
// a page that loses its markers would pass by running nothing. These are the files a
// newcomer copies first; each must still be marked, on the page that shows it.
const REQUIRED: Record<string, string[]> = {
  "packages/vitest-native/README.md": ["vitest.config.mts", "src/readme-greeting.test.tsx"],
  "website/guide/quick-start.md": [
    "src/Greeting.tsx",
    "src/Greeting.test.tsx",
    "src/press.test.tsx",
    "src/device-state.test.tsx",
  ],
};

describe("doc snippets", () => {
  const snippets = readSnippets();

  it.each(Object.entries(REQUIRED))("%s marks its runnable blocks", (page, files) => {
    const marked = snippets.filter((s) => s.page === page).map((s) => s.file);
    expect(marked.sort()).toEqual([...files].sort());
  });

  it("extracts each marked block, and only marked blocks", () => {
    const page = [
      "```ts",
      "unmarked()",
      "```",
      "<!-- doc-snippet: src/a.test.ts -->",
      "```ts",
      "marked()",
      "```",
      "",
    ].join("\n");
    expect(extractSnippets(page)).toEqual([{ file: "src/a.test.ts", code: "marked()\n" }]);
  });

  it("refuses two snippets that write the same file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-snippets-"));
    try {
      expect(() =>
        writeSnippets(dir, [
          { file: "src/x.ts", code: "", page: "a.md" },
          { file: "src/x.ts", code: "", page: "b.md" },
        ]),
      ).toThrow(/both write src\/x\.ts/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
