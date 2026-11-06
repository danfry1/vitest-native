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
import { stripVTControlCharacters } from "node:util";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The pages whose snippets run, relative to the repository root. */
export const SNIPPET_PAGES = ["packages/vitest-native/README.md", "website/guide/quick-start.md"];

/**
 * Whole files that run as snippets, by the file each becomes in the project. The landing
 * page's hero shows these as they are (VitePress imports them with `<<<`), so the code a
 * visitor sees first is code that runs. HERO_RUN is that test's committed run output,
 * which scripts/test-consumers.mjs compares with a fresh run.
 */
export const SNIPPET_FILES = {
  "src/Counter.tsx": "website/.vitepress/hero/Counter.tsx",
  "src/Counter.test.tsx": "website/.vitepress/hero/Counter.test.tsx",
};
export const HERO_TEST = "src/Counter.test.tsx";
export const HERO_RUN = "website/.vitepress/hero/run.txt";

const MARKER = /^<!-- doc-snippet: (\S+) -->\r?\n```[\w-]*\r?\n([\s\S]*?)^```$/gm;

/** Every marked block in a Markdown page, as `{ file, code }`. */
export function extractSnippets(markdown) {
  return [...markdown.matchAll(MARKER)].map(([, file, code]) => ({ file, code }));
}

/**
 * The snippets of every page in SNIPPET_PAGES, then each file in SNIPPET_FILES, each with
 * the page or file it came from.
 */
export function readSnippets(root = repoRoot) {
  const fromPages = SNIPPET_PAGES.flatMap((page) =>
    extractSnippets(fs.readFileSync(path.join(root, page), "utf8")).map((s) => ({ ...s, page })),
  );
  const fromFiles = Object.entries(SNIPPET_FILES).map(([file, source]) => ({
    file,
    code: fs.readFileSync(path.join(root, source), "utf8"),
    page: source,
  }));
  return [...fromPages, ...fromFiles];
}

/**
 * A Vitest run's output reduced to what the hero shows and what stays the same between
 * runs: the engine banner, each test's line, and the totals. Colours and timings go. The
 * banner goes to stderr when the config loads, so a terminal shows it before the tests;
 * captured output puts stderr after stdout, so the banner is moved back to the front.
 */
export function heroRunLines(output) {
  const lines = stripVTControlCharacters(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\[vitest-native\] engine:|^[✓×]|^(Test Files|Tests)\s/.test(line))
    .map((line) => line.replace(/\s+\d+(\.\d+)?\s*m?s$/, "").replace(/\s{2,}/g, " "));
  const banner = (line) => line.startsWith("[vitest-native]");
  return [...lines.filter(banner), ...lines.filter((line) => !banner(line))];
}

/**
 * Writes the snippets into `dir`. Two snippets naming one file, or a file outside
 * `dir` (an absolute path, or one that climbs out with `..`), is an error.
 */
export function writeSnippets(dir, snippets = readSnippets()) {
  const seen = new Map();
  for (const { file, code, page } of snippets) {
    if (seen.has(file)) {
      throw new Error(`doc snippets: ${page} and ${seen.get(file)} both write ${file}`);
    }
    seen.set(file, page);
    const target = path.resolve(dir, file);
    const inside = path.relative(dir, target);
    if (path.isAbsolute(file) || inside.startsWith("..") || path.isAbsolute(inside)) {
      throw new Error(`doc snippets: ${page} names ${file}, which is outside the project`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, code);
  }
  return [...seen.keys()];
}
