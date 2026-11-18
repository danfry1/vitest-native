// Runs every unit test that reads one of the repository's Markdown files.
//
// A docs-only pull request skips the full gate (.github/scripts/classify-change.mjs),
// but several tests take a Markdown page as their source of truth: the versioning
// contract (docs/versioning.md), the preset table (website/guide/presets.md), the README sync (README.md)
// and the documented configuration block (website/guide/plugin-options.md). Skipping
// them let a page drift merge green and turn main red on the next push. CI runs this
// on docs-only pull requests instead.
//
// The set is derived, not listed: a test file qualifies when a string literal in it
// names a tracked .md file (by basename, since tests build paths with path.join). A new
// test that reads a page is picked up without editing anything. Over-matching is cheap
// (a test that only names README.md also runs), under-matching is the failure mode, so
// the run also requires the known readers to be found. Tests that name the site's
// config under website/.vitepress/ qualify too.
//
// End-to-end tests (`*.e2e.test.ts`) qualify the same way but are excluded from
// vitest.config.ts, so they run in a second Vitest run under vitest.e2e.config.ts. Each
// run writes a JSON report, and the script fails when a listed file did not run (#890).
//
// File arguments (paths under tests/) replace the derived list, as the end-to-end test
// of this script (tests/docs-checks.e2e.test.ts) uses them.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import os from "node:os";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = path.join(packageRoot, "tests");

/** The test files that read repository Markdown, split by the config that runs them. */
export function selectDocsChecks() {
  const tracked = spawnSync("git", ["ls-files", "-z", "--full-name", "--", ":/*.md"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  if (tracked.status !== 0) throw new Error(`docs checks: git ls-files failed\n${tracked.stderr}`);
  const pageNames = new Set(
    tracked.stdout
      .split("\0")
      .filter(Boolean)
      .map((f) => path.basename(f)),
  );

  const LITERAL = /["'`]([^"'`\s]*\.md)["'`]/g;
  // The site's config (`website/.vitepress/…`) is docs too: a test that names it runs here.
  const SITE_CONFIG = /["'`][^"'`\s]*\.vitepress[^"'`\s]*["'`]/;
  const readers = fs
    .readdirSync(testsDir)
    .filter((file) => /\.test\.tsx?$/.test(file))
    .filter((file) => {
      const source = fs.readFileSync(path.join(testsDir, file), "utf8");
      return (
        [...source.matchAll(LITERAL)].some((m) => pageNames.has(path.basename(m[1]))) ||
        SITE_CONFIG.test(source)
      );
    })
    .sort();

  const KNOWN = [
    "versioning-contract.test.ts",
    "docs-presets-sync.test.ts",
    "documented-config.test.ts",
    "site-meta.test.ts",
    "redirect-site.test.ts",
  ];
  const lost = KNOWN.filter((file) => !readers.includes(file));
  if (lost.length > 0) {
    throw new Error(`docs checks: the derivation no longer finds ${lost.join(", ")}`);
  }
  return {
    unit: readers.filter((file) => !file.endsWith(".e2e.test.ts")),
    e2e: readers.filter((file) => file.endsWith(".e2e.test.ts")),
  };
}

/** The listed files a Vitest JSON report shows no passed or failed test for. */
export function notRun(listed, report) {
  const ran = new Set(
    report.testResults
      .filter((file) =>
        file.assertionResults.some((t) => t.status === "passed" || t.status === "failed"),
      )
      .map((file) => path.basename(file.name)),
  );
  return listed.filter((file) => !ran.has(path.basename(file)));
}

function main(args) {
  const { unit, e2e } =
    args.length > 0
      ? {
          unit: args.filter((file) => !file.endsWith(".e2e.test.ts")),
          e2e: args.filter((file) => file.endsWith(".e2e.test.ts")),
        }
      : selectDocsChecks();
  const listed = [...unit, ...e2e];
  console.log(`docs checks: ${listed.length} test files read repository Markdown`);
  for (const file of listed) console.log(`  tests/${file}`);

  const require = createRequire(path.join(packageRoot, "package.json"));
  const vitest = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
  const reports = fs.mkdtempSync(path.join(os.tmpdir(), "docs-checks-"));
  let status = 0;
  const missing = [];
  for (const [name, files, config] of [
    ["unit", unit, []],
    ["e2e", e2e, ["--config", "vitest.e2e.config.ts"]],
  ]) {
    // An empty file list would run the whole suite.
    if (files.length === 0) continue;
    const out = path.join(reports, `${name}.json`);
    const run = spawnSync(
      process.execPath,
      [
        vitest,
        "run",
        ...config,
        ...files.map((file) => path.join("tests", file)),
        // A --reporter on the command line replaces the config's reporters: keep the
        // terminal output and, on GitHub Actions, the inline annotations.
        "--reporter=default",
        ...(process.env.GITHUB_ACTIONS === "true" ? ["--reporter=github-actions"] : []),
        "--reporter=json",
        `--outputFile.json=${out}`,
      ],
      { cwd: packageRoot, stdio: "inherit" },
    );
    if (run.status !== 0) status = run.status ?? 1;
    const report = fs.existsSync(out)
      ? JSON.parse(fs.readFileSync(out, "utf8"))
      : { testResults: [] };
    missing.push(...notRun(files, report));
  }
  fs.rmSync(reports, { recursive: true, force: true });
  if (missing.length > 0) {
    console.error(`docs checks: listed but did not run: ${missing.join(", ")}`);
    status = status || 1;
  }
  return status;
}

// Compared through realpath: run through a symlinked path (macOS's /tmp), argv[1] keeps
// the link while import.meta.url is resolved, and main() would be skipped with exit 0.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) process.exit(main(process.argv.slice(2)));
