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

// Same VitePress hazards as fidelity-report.mjs: bare tags, table pipes, and
// Vue interpolation in free text break the site build. Probe names/reasons are
// corpus data, so escape anything rendered outside a code span.
const cell = (s) =>
  String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
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
 */
function describeCell(reportPath, report) {
  const dirName = path.basename(path.dirname(reportPath));
  const m = /^crosscheck-report-rn(.+?)-(locked|latest-supported)$/.exec(dirName);
  return {
    rn: report.reactNativeVersion ?? m?.[1] ?? "unknown",
    vitest: report.vitestVersion ?? (m?.[2] === "latest-supported" ? "latest 4.x" : "locked"),
    flavor: m?.[2] ?? "locked",
  };
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
  const rows = cells
    .map(({ rn, vitest, report }) => {
      const { matching, total } = report.summary;
      const status = matching === total ? "✅" : "❌";
      const when = (report.generatedAt ?? "").slice(0, 10);
      return `| ${cell(rn)} | ${cell(vitest)} | ${status} ${matching}/${total} | ${cell(when)} |`;
    })
    .join("\n");

  const divergences = cells.flatMap(({ rn, vitest, report }) =>
    report.probes
      .filter((p) => !p.match)
      .map(
        (p) =>
          `| \`${p.name}\` | ${cell(rn)} | ${cell(vitest)} | ${cell(p.reason ?? "diverged")} |`,
      ),
  );

  body = `
${allGreen ? `**Every probe matches on every gated React Native version.**` : `**Divergences detected — see the table below.**`}

| React Native | Vitest | Probes matching | Generated |
| --- | --- | --- | --- |
${rows}

## Divergences

${
  divergences.length
    ? `| Probe | React Native | Vitest | Reason |\n| --- | --- | --- | --- |\n${divergences.join("\n")}`
    : "_None. Every probe matched in every cell of the latest matrix run._"
}
`;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${HEADER}${body}`);
console.log(
  `✓ fidelity matrix page rendered (${reportFiles.length} report${reportFiles.length === 1 ? "" : "s"}) → ${path.relative(repoRoot, outPath)}`,
);
