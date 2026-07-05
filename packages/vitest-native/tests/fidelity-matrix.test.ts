/**
 * The fidelity-matrix renderer: aggregates per-cell CI cross-check reports
 * into the published probes-across-versions page.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, "../scripts/fidelity-matrix.mjs");

function render(args: string[]): { out: string; page: string } {
  const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vn-matrix-out-")), "page.md");
  const out = execFileSync(process.execPath, [SCRIPT, ...args, "--out", outFile], {
    encoding: "utf8",
  });
  return { out, page: fs.readFileSync(outFile, "utf8") };
}

function writeReport(dir: string, artifactName: string, report: Record<string, unknown>): void {
  const d = path.join(dir, artifactName);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "report.json"), JSON.stringify(report));
}

describe("fidelity-matrix renderer", () => {
  it("renders a placeholder page when no reports exist", () => {
    const { page } = render([]);
    expect(page).toContain("GENERATED FILE");
    expect(page).toContain("No matrix data in this build");
    expect(page).toContain("/guide/fidelity");
  });

  it("aggregates per-cell reports into a sorted matrix with divergences escaped", () => {
    const reports = fs.mkdtempSync(path.join(os.tmpdir(), "vn-matrix-reports-"));
    writeReport(reports, "crosscheck-report-rn0.85-locked", {
      reactNativeVersion: "0.85.2",
      vitestVersion: "4.1.8",
      generatedAt: "2026-07-04T09:00:00.000Z",
      summary: { total: 75, matching: 75 },
      probes: [{ name: "a11y-role", match: true }],
    });
    writeReport(reports, "crosscheck-report-rn0.81-latest-supported", {
      reactNativeVersion: "0.81.5",
      vitestVersion: "4.2.1",
      generatedAt: "2026-07-04T09:05:00.000Z",
      summary: { total: 75, matching: 74 },
      probes: [
        { name: "a11y-role", match: true },
        // VitePress hazards in the reason: pipes break table cells, bare tags
        // and {{ }} break the Vue compile — all must be escaped.
        { name: "press-event", match: false, reason: "mock <Text> got a|b {{ nope }}" },
      ],
    });

    const { page } = render(["--reports", reports]);
    // Sorted by RN version: 0.81 row before 0.85.
    expect(page.indexOf("0.81.5")).toBeLessThan(page.indexOf("0.85.2"));
    // Per-cell summary rows with pass state.
    expect(page).toContain("| 0.85.2 | 4.1.8 | ✅ 75/75 | 2026-07-04 |");
    expect(page).toContain("| 0.81.5 | 4.2.1 | ❌ 74/75 | 2026-07-04 |");
    // Divergence table present, with hazards escaped.
    expect(page).toContain("| press-event |");
    expect(page).toContain("mock &lt;Text&gt; got a\\|b &#123;&#123; nope &#125;&#125;");
    expect(page).not.toContain("<Text>");
    // Not the all-green banner.
    expect(page).toContain("Divergences detected");
  });

  it("escapes hostile probe names (reports are CI artifacts, treated as untrusted)", () => {
    const reports = fs.mkdtempSync(path.join(os.tmpdir(), "vn-matrix-reports-"));
    writeReport(reports, "crosscheck-report-rn0.84-locked", {
      reactNativeVersion: "0.84.0",
      vitestVersion: "4.1.8",
      generatedAt: "2026-07-04T09:00:00.000Z",
      summary: { total: 2, matching: 1 },
      probes: [
        { name: "ok-probe", match: true },
        // A backtick would open a code span; a pipe breaks the row; a tag
        // injects HTML into the built site.
        { name: "evil` | <img src=x onerror=alert(1)>", match: false, reason: "r" },
      ],
    });
    const { page } = render(["--reports", reports]);
    expect(page).not.toContain("<img");
    expect(page).toContain("evil&#96; \\| &lt;img src=x onerror=alert(1)&gt;");
  });

  it("exits non-zero on a corrupt report artifact (placeholder ships instead)", () => {
    const reports = fs.mkdtempSync(path.join(os.tmpdir(), "vn-matrix-reports-"));
    const d = path.join(reports, "crosscheck-report-rn0.82-locked");
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "report.json"), "{ not json");
    expect(() => render(["--reports", reports])).toThrow();
  });

  it("--check passes on the committed placeholder and fails on drift", () => {
    // The committed page must be exactly the placeholder render.
    execFileSync(process.execPath, [SCRIPT, "--check"], { encoding: "utf8" });
    // A page with data (or any divergent content) must fail the gate.
    const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vn-matrix-check-")), "p.md");
    fs.writeFileSync(outFile, "not the placeholder");
    expect(() =>
      execFileSync(process.execPath, [SCRIPT, "--check", "--out", outFile], { encoding: "utf8" }),
    ).toThrow();
  });

  it("declares all-green when every cell matches fully", () => {
    const reports = fs.mkdtempSync(path.join(os.tmpdir(), "vn-matrix-reports-"));
    writeReport(reports, "crosscheck-report-rn0.86-locked", {
      reactNativeVersion: "0.86.0",
      vitestVersion: "4.1.8",
      generatedAt: "2026-07-04T09:00:00.000Z",
      summary: { total: 75, matching: 75 },
      probes: [{ name: "a11y-role", match: true }],
    });
    const { page } = render(["--reports", reports]);
    expect(page).toContain("Every probe matches on every gated React Native version.");
    expect(page).toContain("_None. Every probe matched in every cell of the latest matrix run._");
  });

  it("falls back to artifact-name axes when the report lacks resolved versions", () => {
    const reports = fs.mkdtempSync(path.join(os.tmpdir(), "vn-matrix-reports-"));
    writeReport(reports, "crosscheck-report-rn0.83-latest-supported", {
      generatedAt: "2026-07-04T09:00:00.000Z",
      summary: { total: 10, matching: 10 },
      probes: [],
    });
    const { page } = render(["--reports", reports]);
    expect(page).toContain("| 0.83 | latest 4.x | ✅ 10/10 |");
  });
});
