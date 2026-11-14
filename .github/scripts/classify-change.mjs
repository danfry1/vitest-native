// Decides which gate groups a change needs, from the files it touches.
//
// Groups (each one a job condition in its workflow):
//   full    ci.yml `Full gate` matrix: static checks and the unit suite, every OS and Node
//   native  the `Full gate` legs' native-engine steps (the native suites, the hot runtime,
//           the cross-check); without `full` it runs nothing
//   packed  ci.yml `Packed gate` cells: packed consumer, Expo, hot-runtime and semantics
//   rn      native-rn-matrix.yml cells
//   axes    config-axis-matrix.yml cells
//   unit    ci.yml `Unit checks`: lint, format, typecheck and the unit suite on one leg,
//           when `full` is skipped. Several unit tests read workflows, validation
//           scripts and fixtures as their source of truth, so every change that is not
//           docs-only runs them.
//   snippets ci.yml `Doc snippets`: the README and quick-start code run against the
//           packed package (SNIPPET_PATHS), when a change touches it and `packed` is
//           skipped; the packed consumer cell runs it otherwise.
//
// Only a pull request is narrowed. A push to main, a schedule, a manual run and a
// merge-queue group run every group (a docs-only group still skips, as before): main
// seeds the caches pull requests restore, and its runs are the complete record.
//
// Each changed file selects the groups of the first rule it matches. A file no rule
// names runs every group, so a new directory is covered until a rule narrows it.
// package.json and bun.lock are deliberately not narrowed: manifest and lockfile
// changes caught Android-only and Windows-only failures on pull requests.
//
// Jobs are skipped by condition, never by `on.<event>.paths`: GitHub reports a job
// skipped by a condition as successful, but leaves the checks of a workflow skipped by
// path filtering pending, which blocks a required check ("Troubleshooting required
// status checks", GitHub Docs). The verdict jobs count skipped as success.
//
// Docs-only: every changed file is prose, a changeset, licence text or a static site
// asset. scripts/contributors.mjs counts as prose (it only rewrites README.md's
// contributors list, and nothing in CI runs it). website/guide/fidelity.md and
// fidelity-matrix.md are generated from the live corpus and gated by fidelity:check,
// so a hand edit there runs everything, as #181 needed. ci.yml's `Docs checks` job
// runs the unit tests that read repository Markdown on a docs-only change.
//
// Usage: classify-change.mjs <event> <base-sha> <head-sha>   (needs full history)
// Diffs the head against its merge base with the base, with renames listed as a
// deletion and an addition so a file moved out of a fully gated path still counts. Writes each output to
// $GITHUB_OUTPUT when set, and always to stdout.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { SNIPPET_PAGES } from "../../packages/vitest-native/scripts/doc-snippets.mjs";

export const GROUPS = ["full", "native", "packed", "rn", "axes"];
const ALL = GROUPS;
const P = "packages/vitest-native/";

const isFidelityPage = (file) => /^website\/guide\/fidelity(-matrix)?\.md$/.test(file);
const isDocs = (file) =>
  !isFidelityPage(file) &&
  (file.endsWith(".md") ||
    file.startsWith(".changeset/") ||
    file === "LICENSE" ||
    file.startsWith("website/public/") ||
    file === "scripts/contributors.mjs");

/** [file test, groups beyond `unit`], first match wins. */
export const RULES = [
  [isDocs, []],
  // The site's own code: no gate builds the site (pages.yml, on main), and the unit suite
  // runs its tests. The landing page's hero files run as snippets in the packed consumer
  // cell (scripts/doc-snippets.mjs), and the generated fidelity pages fall through to
  // every group (fidelity:check).
  [(f) => f.startsWith("website/.vitepress/hero/"), ["packed"]],
  [(f) => f.startsWith("website/") && !isFidelityPage(f), []],
  // Workflows that are not a gate group's own. bug-museum.yml runs itself, on its paths.
  [(f) => f === ".github/workflows/ci.yml", ["full", "native", "packed"]],
  [(f) => f === ".github/workflows/native-rn-matrix.yml", ["rn"]],
  // fidelity:check (Full gate) publishes the React Native range from rn-matrix.json.
  [
    (f) => f === ".github/rn-matrix.json" || f === ".github/scripts/rn-matrix.mjs",
    ["full", "native", "rn"],
  ],
  [(f) => f === ".github/workflows/config-axis-matrix.yml", ["axes"]],
  [(f) => /^\.github\/workflows\/[\w-]+\.yml$/.test(f), []],
  [(f) => f === ".github/dependabot.yml", []],
  // The bug museum runs itself on its own paths; the axes cells run validation/config-axes.
  [(f) => f.startsWith(`${P}validation/bug-museum/`), []],
  [(f) => f.startsWith(`${P}validation/config-axes/`), ["axes"]],
  // Read only by check:size, on a Full gate leg.
  [(f) => f === `${P}package-budget.json`, ["full"]],
  // Only the unit test files themselves: tests/support and the fixtures are also read by
  // tests-native (the RN matrix) and copied into packed consumers. The unit suite runs on
  // every Full gate leg; the native steps do not read these files.
  [(f) => /^packages\/vitest-native\/tests\/[\w.-]+\.test\.tsx?$/.test(f), ["full"]],
  [
    (f) => f.startsWith(`${P}tests-native/`) || f.startsWith(`${P}crosscheck/`),
    ["full", "native", "rn"],
  ],
  [
    (f) =>
      f.startsWith(`${P}consumer-tests/`) ||
      f === `${P}scripts/test-consumers.mjs` ||
      f.startsWith("apps/"),
    ["full", "native", "packed"],
  ],
  [(f) => f.startsWith(`${P}src/cli/`), ["full", "native", "packed"]],
  // The benchmark workspace and the scheduled bake-off ratchet's data: no gate reads them.
  [(f) => f.startsWith("bench/") || f === `${P}bakeoffs-ratchet.json`, []],
  [(f) => /(^|\/)\.gitignore$/.test(f), []],
];

/** The groups one file needs: its first matching rule's, or every group. */
export function groupsForFile(file) {
  for (const [matches, groups] of RULES) if (matches(file)) return groups;
  return ALL;
}

/**
 * The pages whose marked code blocks run against the packed package (SNIPPET_PAGES, the
 * list scripts/doc-snippets.mjs reads, so the two cannot drift), the root README the
 * package README mirrors, and the extractor and the app they run in. They are prose to
 * every other rule, so a change to one alone would run nothing that executes them.
 */
export const SNIPPET_PATHS = ["README.md", ...SNIPPET_PAGES, `${P}scripts/doc-snippets.mjs`];
const isSnippetSource = (file) =>
  SNIPPET_PATHS.includes(file) || file.startsWith(`${P}consumer-tests/expo-template/`);

/** Each output for an event and the files it changes. */
export function classify(event, files) {
  const pullRequest = event === "pull_request";
  const reviewable = pullRequest || event === "merge_group";
  const docsOnly = reviewable && files.every(isDocs);
  const need = new Set(
    docsOnly ? [] : pullRequest ? files.flatMap((file) => groupsForFile(file)) : ALL,
  );
  const out = { "docs-only": docsOnly };
  for (const group of GROUPS) out[group] = need.has(group);
  out.unit = !docsOnly && !need.has("full");
  // The packed consumer cell runs the snippets with the fixtures; when it is skipped,
  // `Doc snippets` runs them alone.
  out.snippets = !need.has("packed") && files.some(isSnippetSource);
  return out;
}

// Compared as real paths, so a symlinked checkout still runs the CLI. A run that wrote
// no outputs would not skip anything: the job conditions run a group unless its output
// is 'false'.
const realpath = (file) => {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
};
if (process.argv[1] && realpath(process.argv[1]) === realpath(fileURLToPath(import.meta.url))) {
  const [event, base, head] = process.argv.slice(2);
  const files =
    event === "pull_request" || event === "merge_group"
      ? execFileSync("git", ["diff", "--name-only", "--no-renames", `${base}...${head}`], {
          encoding: "utf8",
        })
          .split("\n")
          .filter(Boolean)
      : [];
  for (const file of files) console.log(`  ${file}`);
  const out = classify(event, files);
  const lines = Object.entries(out).map(([key, value]) => `${key}=${value}`);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}
