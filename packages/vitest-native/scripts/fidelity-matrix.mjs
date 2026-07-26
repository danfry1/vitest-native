// Fidelity matrix page: aggregate the per-cell cross-check reports produced by
// the CI matrix (one report.json per RN × Vitest cell) into a published
// probes-across-versions dashboard.
//
// CI already proves mock ≡ real-RN parity per RN version on every commit — but
// it used to throw the per-cell reports away, leaving the published fidelity
// page a single-version snapshot. This script turns those reports into the
// dashboard page:
//
//   node scripts/fidelity-matrix.mjs --reports <dir>   # <dir>/**/report.json
//   node scripts/fidelity-matrix.mjs                   # placeholder page
//
// The page is rendered at DEPLOY time by pages.yml from the latest successful
// matrix run's artifacts; the committed website/guide/fidelity-matrix.md is a
// placeholder that keeps local site builds (and VitePress dead-link checks)
// working and is overwritten in the deploy workspace before the build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "..", "..");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const reportsDir = argValue("--reports");
const outPath = argValue("--out") ?? path.join(repoRoot, "website", "guide", "fidelity-matrix.md");

// Same VitePress hazards as fidelity-report.mjs — bare tags, table pipes, and
// Vue interpolation in free text break the site build — plus backticks, which
// would open a code span and turn the rest of the row into live markup. Every
// report field is treated as untrusted data (the reports are CI artifacts),
// so ALL of them render through this escape, code-span styling deliberately
// forgone.
const cell = (s) =>
  String(s ?? "")
    // Backslashes first — escaping them after the fact would re-arm the very
    // characters the later replacements neutralize (CodeQL js/incomplete-sanitization).
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`/g, "&#96;")
    .replace(/\{\{/g, "&#123;&#123;")
    .replace(/\}\}/g, "&#125;&#125;");

/** Recursively collect report.json files under dir. */
function collectReports(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectReports(p));
    else if (entry.name === "report.json") out.push(p);
  }
  return out;
}

/**
 * The artifact directory name carries the matrix axes
 * (crosscheck-report-rn<version>-<vitest-flavor>); the report body carries the
 * RESOLVED versions. Prefer the body, fall back to the directory name.
 *
 * The flavor is matched openly rather than against a list of known names. An
 * allow-list here silently mislabels any cell added later: `v5` cells went in
 * without one and were read as `locked`, because the fallback picked a real
 * flavor name instead of admitting the parse had failed. An unrecognized
 * directory now says so.
 */
function describeCell(reportPath, report) {
  const dirName = path.basename(path.dirname(reportPath));
  const m = /^crosscheck-report-rn(.+?)-(.+)$/.exec(dirName);
  return {
    rn: report.reactNativeVersion ?? m?.[1] ?? "unknown",
    // Only the report body knows the RESOLVED Vitest version. The flavor is the
    // axis, carried in its own column, so an absent body version is reported as
    // unknown rather than restated as the axis name.
    vitest: report.vitestVersion ?? "unknown",
    flavor: m?.[2] ?? "unknown",
  };
}

/**
 * The matrix axes, read from the workflow that defines them, so the page can
 * state what was gated rather than only what happened to arrive. Artifacts are
 * downloaded best-effort at deploy time (`|| true`, `if-no-files-found: ignore`,
 * 30-day retention), so a partial set is an ordinary outcome — and a table built
 * from it still read "Every probe matches on every gated React Native version",
 * a claim about cells that were never in the render.
 */
function expectedCells() {
  try {
    const wf = fs.readFileSync(
      path.join(repoRoot, ".github", "workflows", "native-rn-matrix.yml"),
      "utf8",
    );
    const lines = wf.split("\n");
    const axis = (name) => {
      const line = lines.find((l) => new RegExp(`^\\s*${name}:\\s*\\[`).test(l));
      return [...(line?.matchAll(/'([^']+)'/g) ?? [])].map((m) => m[1]);
    };
    const rns = axis("rn");
    const flavors = axis("vitest");
    if (rns.length === 0 || flavors.length === 0) return null;
    const cells = new Set(rns.flatMap((rn) => flavors.map((f) => `${rn}-${f}`)));
    // `include:` entries add cells outside the cross product.
    const includeBlock = wf.slice(wf.indexOf("include:"));
    for (const m of includeBlock.matchAll(/-\s*rn:\s*'([^']+)'\s*\n\s*vitest:\s*'([^']+)'/g)) {
      cells.add(`${m[1]}-${m[2]}`);
    }
    return cells;
  } catch {
    return null;
  }
}

/** Match a rendered cell back to its matrix key: RN is resolved (0.86.0), the axis is a series (0.86). */
function matrixKey({ rn, flavor }) {
  const series = String(rn).split(".").slice(0, 2).join(".");
  return `${series}-${flavor}`;
}

const HEADER = `<!--
  GENERATED FILE — do not edit by hand.
  The committed version is a placeholder; pages.yml regenerates this page at
  deploy time from the latest CI matrix run's cross-check reports
  (scripts/fidelity-matrix.mjs).
-->
# Fidelity matrix

The [behavioral cross-check](/guide/fidelity) runs the same probe corpus under
the mock engine **and** under real React Native — and CI runs it against
**every supported React Native version** in the
[Vitest × RN matrix](https://github.com/danfry1/vitest-native/actions/workflows/native-rn-matrix.yml).
This page is generated from that matrix's own reports, so every number below
was produced by CI, not written by hand.
`;

const reportFiles = collectReports(reportsDir);
let body;

if (reportFiles.length === 0) {
  body = `
::: info No matrix data in this build
This page is populated from the latest CI matrix run when the site is deployed.
A local or matrix-less build shows this placeholder. The single-version
[Fidelity Report](/guide/fidelity) is always available and drift-gated in CI.
:::
`;
} else {
  const cells = reportFiles
    .map((p) => {
      const report = JSON.parse(fs.readFileSync(p, "utf8"));
      return { ...describeCell(p, report), report };
    })
    .sort(
      (a, b) =>
        a.rn.localeCompare(b.rn, undefined, { numeric: true }) || a.flavor.localeCompare(b.flavor),
    );

  const allGreen = cells.every((c) => c.report.summary.matching === c.report.summary.total);

  // Cells that arrived, against the cells the workflow gates.
  const expected = expectedCells();
  const present = new Set(cells.map(matrixKey));
  const missing = expected ? [...expected].filter((k) => !present.has(k)).sort() : [];
  const complete = expected !== null && missing.length === 0;

  const rows = cells
    .map(({ rn, vitest, flavor, report }) => {
      const { matching, total } = report.summary;
      const status = matching === total ? "✅" : "❌";
      const when = (report.generatedAt ?? "").slice(0, 10);
      // The flavor is what separates two cells that resolve to the same Vitest
      // version. Rendering only the resolved version made `locked` and
      // `latest-supported` byte-identical rows — the published table repeated
      // every React Native version twice with nothing to tell the pair apart,
      // and the axis the matrix exists to cover was invisible.
      return `| ${cell(rn)} | ${cell(vitest)} | ${cell(flavor)} | ${status} ${matching}/${total} | ${cell(when)} |`;
    })
    .join("\n");

  // NOTE: crosscheck.mjs exits non-zero on any divergence, so CI's
  // artifact-selection (latest SUCCESSFUL run) never feeds this branch — the
  // deployed page shows the last all-green run while CI is red. The rendering
  // exists for manually-supplied report directories and forensics; do not
  // remove it as dead code.
  const divergences = cells.flatMap(({ rn, vitest, report }) =>
    report.probes
      .filter((p) => !p.match)
      .map(
        (p) =>
          `| ${cell(p.name)} | ${cell(rn)} | ${cell(vitest)} | ${cell(p.reason ?? "diverged")} |`,
      ),
  );

  const headline = !allGreen
    ? `**Divergences detected — see the table below.**`
    : complete
      ? `**Every probe matches on every gated React Native version.**`
      : `**Every probe matches in every cell shown below.** This build is missing ${missing.length} of the ${(expected?.size ?? 0).toString()} gated cells, so it is not a statement about the full matrix.`;

  const missingNote = missing.length
    ? `\n::: warning Incomplete matrix data\nNo report arrived for ${missing.map((k) => `\`${cell(k)}\``).join(", ")}. Matrix artifacts are downloaded best-effort at deploy time and expire after 30 days; a cell that failed before the cross-check ran uploads nothing. The rows below are still CI-produced — there are simply fewer of them than the matrix gates.\n:::\n`
    : "";

  body = `
${headline}
${missingNote}
| React Native | Vitest | Flavor | Probes matching | Generated |
| --- | --- | --- | --- | --- |
${rows}

## Divergences

${
  divergences.length
    ? `| Probe | React Native | Vitest | Reason |\n| --- | --- | --- | --- |\n${divergences.join("\n")}`
    : "_None. Every probe matched in every cell of the latest matrix run._"
}
`;
}

const content = `${HEADER}${body}`;

if (process.argv.includes("--check")) {
  // Drift gate for the COMMITTED page: it must be exactly the placeholder
  // render — real matrix data belongs only in the deploy workspace, never in
  // the repository.
  if (reportFiles.length > 0) {
    console.error("✗ --check validates the committed placeholder; run it without --reports.");
    process.exit(1);
  }
  const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : null;
  if (current !== content) {
    console.error(
      `✗ ${path.relative(repoRoot, outPath)} is not the placeholder render — regenerate with \`node scripts/fidelity-matrix.mjs\` and commit.`,
    );
    process.exit(1);
  }
  console.log("✓ committed fidelity-matrix placeholder is up to date");
} else {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content);
  console.log(
    `✓ fidelity matrix page rendered (${reportFiles.length} report${reportFiles.length === 1 ? "" : "s"}) → ${path.relative(repoRoot, outPath)}`,
  );
}
