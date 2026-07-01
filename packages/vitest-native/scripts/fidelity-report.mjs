// Fidelity report pipeline: turn the behavioral cross-check into a published,
// self-updating proof of mock-vs-real-React-Native parity.
//
// It runs the cross-check (scripts/crosscheck.mjs), reads the combined report it
// writes to crosscheck/.out/report.json, and regenerates two COMMITTED artifacts:
//   1. crosscheck/fidelity-badge.json — a shields.io endpoint badge (live count).
//   2. website/guide/fidelity.md      — the published fidelity page (full corpus
//      table + summary + honest known-differences ledger).
//
// The published probe count therefore comes from the actual corpus, never a
// hand-typed number, so it cannot drift as probes are added.
//
// Usage: `bun run fidelity:report` (or `node scripts/fidelity-report.mjs`).
// Pass `--no-run` to render from the existing .out/report.json without re-running
// the cross-check (faster when iterating on the page format).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "..", "..");
const reportPath = path.join(root, "crosscheck", ".out", "report.json");
const badgePath = path.join(root, "crosscheck", "fidelity-badge.json");
const knownDiffsPath = path.join(root, "crosscheck", "known-differences.json");
const pagePath = path.join(repoRoot, "website", "guide", "fidelity.md");

// A non-zero cross-check exit means EITHER a probe diverged OR the suite itself
// exited non-zero while probes still matched (crosscheck.mjs's `!native.ok` guard
// — an unhandled rejection, a throwing hook, a worker teardown error). Both must
// fail this gate, so the subprocess status is propagated at the end; rendering
// still proceeds so the page reflects whatever was captured. fidelity:check is
// therefore a strict superset of `crosscheck` (the gate it replaces in CI).
let crosscheckFailed = false;
if (!process.argv.includes("--no-run")) {
  console.log("── running cross-check to refresh report data ──");
  const res = spawnSync(process.execPath, [path.join(root, "scripts", "crosscheck.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  if (res.status !== 0) {
    if (!fs.existsSync(reportPath)) {
      console.error("✗ cross-check did not produce a report — failing.");
      process.exit(1);
    }
    crosscheckFailed = true;
    console.warn("\n⚠ cross-check exited non-zero — this run will fail after rendering.\n");
  }
}

if (!fs.existsSync(reportPath)) {
  console.error(`✗ no report at ${reportPath} — run without --no-run first.`);
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const { summary, probes } = report;
if (!summary?.total) {
  console.error("✗ report has zero probes — the cross-check likely failed to run.");
  process.exit(1);
}
const allMatch = summary.matching === summary.total;
// In --check mode the artifacts are rendered and compared to what's committed,
// but never written; a difference exits non-zero. This is the CI drift guard:
// it proves the published page/badge still match the live corpus.
const checkOnly = process.argv.includes("--check");

// Derive the CI version range from the matrix workflow (the source of truth) so
// the published page can never disagree with what CI actually gates.
function ciReactNativeRange() {
  try {
    const wf = fs.readFileSync(
      path.join(repoRoot, ".github", "workflows", "native-rn-matrix.yml"),
      "utf8",
    );
    const line = wf.split("\n").find((l) => /^\s*rn:\s*\[/.test(l));
    const versions = [...(line?.matchAll(/'([\d.]+)'/g) ?? [])].map((m) => m[1]);
    if (versions.length >= 2) return `${versions[0]}–${versions[versions.length - 1]}`;
    if (versions.length === 1) return versions[0];
  } catch {}
  return null;
}
const ciRange = ciReactNativeRange();
const ciLine = ciRange
  ? `CI runs the same corpus across **React Native ${ciRange}** on every commit.`
  : `CI runs the same corpus across every supported React Native version on every commit.`;

// --- 1. Badge (shields.io endpoint schema) ---
const badge = {
  schemaVersion: 1,
  label: "RN fidelity",
  message: `${summary.matching}/${summary.total} probes`,
  color: allMatch ? "brightgreen" : "red",
};
const badgeContent = `${JSON.stringify(badge, null, 2)}\n`;

// --- 2. Page ---
const knownDiffs = fs.existsSync(knownDiffsPath)
  ? JSON.parse(fs.readFileSync(knownDiffsPath, "utf8"))
  : [];

// The page is built by VitePress, which parses Markdown as Vue: a bare `<Tag>`
// in free text is read as an (unclosed) HTML element and breaks the build, `|`
// breaks table columns, and `{{ }}` is Vue interpolation. Probe names/reasons
// and known-difference text come from the corpus, so escape those hazards in
// any cell rendered as free text (not inside a code span).
const cell = (s) =>
  String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{\{/g, "&#123;&#123;")
    .replace(/\}\}/g, "&#125;&#125;");

const probeRows = probes
  .map((p) => `| \`${p.name}\` | ${p.match ? "✅ match" : `❌ ${cell(p.reason ?? "diverged")}`} |`)
  .join("\n");

const knownDiffRows = knownDiffs.length
  ? knownDiffs.map((d) => `| ${cell(d.area)} | ${cell(d.difference)} | ${cell(d.why)} |`).join("\n")
  : "| _none recorded_ | | |";

const page = `<!--
  GENERATED FILE — do not edit by hand.
  Regenerate with \`bun run fidelity:report\`. Source: the behavioral cross-check
  corpus (packages/vitest-native/crosscheck/) and known-differences.json.
-->
# Fidelity report

The \`mock\` engine is a reimplementation of React Native, so it could in principle
drift from real RN. vitest-native guards against that with a **behavioral
cross-check**: a corpus of probes runs the *same* assertions under the mock engine
**and** under real React Native, and any divergence fails CI. This page is
generated from the corpus itself, so the numbers below are exactly what ships.

## Summary

- **${summary.matching} / ${summary.total} probes** match between the mock engine and real React Native.
- ${ciLine}
- Reproduce it yourself: \`bun run crosscheck\`.

The \`native\` engine needs no cross-check — it *is* real React Native.

## Probes

Each probe renders or exercises a real behavior (queries, presses, text input,
lists, scrolling, modals, and core API values) and compares the observable result
across both engines.

| Probe | Result |
| --- | --- |
${probeRows}

## Not gated by the cross-check

Some behaviors are deliberately left out of the gated corpus above because they
vary by React Native version, test environment, or device — a single fixed value
can't be correct for all of them, so pinning one would make the cross-check lie.
They are documented here rather than hidden.

| Area | Behavior | Why it isn't gated |
| --- | --- | --- |
${knownDiffRows}
`;

// Write the artifacts, or in --check mode compare them and report any drift.
const artifacts = [
  { label: "badge", file: badgePath, content: badgeContent },
  { label: "page", file: pagePath, content: page },
];
const drifted = [];
for (const { label, file, content } of artifacts) {
  if (checkOnly) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (current !== content) drifted.push({ label, file });
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

if (checkOnly) {
  if (drifted.length) {
    console.error(
      `✗ fidelity artifacts are stale — run \`bun run fidelity:report\` and commit:\n` +
        drifted.map((d) => `    ${path.relative(repoRoot, d.file)}`).join("\n"),
    );
    process.exit(1);
  }
  console.log(`✓ fidelity artifacts are up to date (${badge.message})`);
} else {
  console.log(`\n✓ fidelity report rendered`);
  console.log(`  badge: ${path.relative(repoRoot, badgePath)} (${badge.message})`);
  console.log(`  page:  ${path.relative(repoRoot, pagePath)}`);
}
// Fail on a probe divergence (!allMatch) OR any other non-zero cross-check exit.
if (!allMatch || crosscheckFailed) process.exit(1);
