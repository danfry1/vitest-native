// Runs every unit test that reads one of the repository's Markdown files.
//
// A docs-only pull request skips the full gate (.github/scripts/classify-change.sh),
// but several tests take a Markdown page as their source of truth: the versioning
// contract (docs/versioning.md), the preset tables (README.md, website/guide/presets.md)
// and the documented configuration block (website/guide/plugin-options.md). Skipping
// them let a page drift merge green and turn main red on the next push. CI runs this
// on docs-only pull requests instead.
//
// The set is derived, not listed: a test file qualifies when a string literal in it
// names a tracked .md file (by basename, since tests build paths with path.join). A new
// test that reads a page is picked up without editing anything. Over-matching is cheap
// (a test that only names README.md also runs), under-matching is the failure mode, so
// the run also requires the three known readers to be found.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = path.join(packageRoot, "tests");

const tracked = spawnSync("git", ["ls-files", "-z", "--full-name", "--", ":/*.md"], {
  cwd: packageRoot,
  encoding: "utf8",
});
if (tracked.status !== 0) {
  console.error(`docs checks: git ls-files failed\n${tracked.stderr}`);
  process.exit(1);
}
const pageNames = new Set(
  tracked.stdout
    .split("\0")
    .filter(Boolean)
    .map((f) => path.basename(f)),
);

const LITERAL = /["'`]([^"'`\s]*\.md)["'`]/g;
const readers = fs
  .readdirSync(testsDir)
  .filter((file) => /\.test\.tsx?$/.test(file))
  .filter((file) => {
    const source = fs.readFileSync(path.join(testsDir, file), "utf8");
    return [...source.matchAll(LITERAL)].some((m) => pageNames.has(path.basename(m[1])));
  })
  .sort();

const KNOWN = [
  "versioning-contract.test.ts",
  "docs-presets-sync.test.ts",
  "documented-config.test.ts",
];
const lost = KNOWN.filter((file) => !readers.includes(file));
if (lost.length > 0) {
  console.error(`docs checks: the derivation no longer finds ${lost.join(", ")}`);
  process.exit(1);
}

console.log(`docs checks: ${readers.length} test files read repository Markdown`);
for (const file of readers) console.log(`  tests/${file}`);

const require = createRequire(path.join(packageRoot, "package.json"));
const vitest = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const run = spawnSync(
  process.execPath,
  [vitest, "run", ...readers.map((file) => path.join("tests", file))],
  { cwd: packageRoot, stdio: "inherit" },
);
process.exit(run.status ?? 1);
