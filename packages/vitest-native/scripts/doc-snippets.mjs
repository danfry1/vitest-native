// The code a newcomer copies from the README and the quick start, extracted so it can
// be run as written.
//
// The quick start once installed neither vitest nor React Native Testing Library and
// called render() synchronously, which fails on RNTL 14: snippets were checked by
// reading them, and reading did not catch it. A block meant to run carries a marker on
// the line before its fence, naming the file it becomes in a project:
//
//   <!-- doc-snippet: src/Greeting.test.tsx -->
//   ```tsx
//   ...
//   ```
//
// The marker is an HTML comment, so GitHub, npm and VitePress do not show it.
// scripts/test-consumers.mjs writes the extracted files into a packed Expo SDK 58 app
// (RNTL 14) and runs them; tests/doc-snippets.test.ts checks that the pages still carry
// the markers, so deleting one fails on a docs-only pull request too.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The pages whose snippets run, relative to the repository root. */
export const SNIPPET_PAGES = ["packages/vitest-native/README.md", "website/guide/quick-start.md"];

const MARKER = /^<!-- doc-snippet: (\S+) -->\r?\n```[\w-]*\r?\n([\s\S]*?)^```$/gm;

/** Every marked block in a Markdown page, as `{ file, code }`. */
export function extractSnippets(markdown) {
  return [...markdown.matchAll(MARKER)].map(([, file, code]) => ({ file, code }));
}

/** The snippets of every page in SNIPPET_PAGES, each with the page it came from. */
export function readSnippets(root = repoRoot) {
  return SNIPPET_PAGES.flatMap((page) =>
    extractSnippets(fs.readFileSync(path.join(root, page), "utf8")).map((s) => ({ ...s, page })),
  );
}

/** Writes the snippets into `dir`. Two snippets naming one file is an error. */
export function writeSnippets(dir, snippets = readSnippets()) {
  const seen = new Map();
  for (const { file, code, page } of snippets) {
    if (seen.has(file)) {
      throw new Error(`doc snippets: ${page} and ${seen.get(file)} both write ${file}`);
    }
    seen.set(file, page);
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, code);
  }
  return [...seen.keys()];
}
