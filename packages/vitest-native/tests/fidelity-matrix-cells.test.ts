/**
 * The published fidelity matrix has to describe the run it was built from.
 *
 * Three ways it did not. Every row rendered only the RESOLVED Vitest version, so
 * the `locked` and `latest-supported` cells — which normally resolve to the same
 * version — came out byte-identical: the live page listed each React Native
 * version twice with nothing to tell the pair apart, and the axis the matrix
 * exists to cover was invisible. The artifact-name parser matched flavors against
 * a list of known names, so the `v5` cells added later fell through to a fallback
 * that named a different real flavor rather than admitting the parse failed. And
 * the headline — "Every probe matches on every gated React Native version" — was
 * quantified over whatever artifacts happened to download, while the deploy step
 * downloads best-effort (`|| true`, `if-no-files-found: ignore`, 30-day
 * retention), so a partial set still published a claim about the whole matrix.
 *
 * These render through the real script into a temp file, so nothing committed is
 * touched.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(packageRoot, "scripts", "fidelity-matrix.mjs");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fidelity-matrix-"));

afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

/** Build a reports directory shaped exactly like the CI artifact download. */
function reportsDir(cells: Array<{ rn: string; flavor: string; vitest: string }>): string {
  const dir = fs.mkdtempSync(path.join(tmpRoot, "reports-"));
  for (const { rn, flavor, vitest } of cells) {
    const cellDir = path.join(dir, `crosscheck-report-rn${rn}-${flavor}`);
    fs.mkdirSync(cellDir, { recursive: true });
    fs.writeFileSync(
      path.join(cellDir, "report.json"),
      JSON.stringify({
        reactNativeVersion: `${rn}.0`,
        vitestVersion: vitest,
        generatedAt: "2026-07-25T00:00:00.000Z",
        summary: { total: 81, matching: 81 },
        probes: [{ name: "a11y-role", match: true }],
      }),
    );
  }
  return dir;
}

let renderCount = 0;
function render(cells: Parameters<typeof reportsDir>[0]): string {
  const out = path.join(tmpRoot, `out-${renderCount++}.md`);
  const res = spawnSync(process.execPath, [script, "--reports", reportsDir(cells), "--out", out], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  expect(res.status).toBe(0);
  return fs.readFileSync(out, "utf8");
}

/** Every cell the matrix workflow gates — the set the headline quantifies over. */
const ALL_CELLS = (() => {
  const rns = ["0.81", "0.82", "0.83", "0.84", "0.85", "0.86", "0.87"];
  const cells = rns.flatMap((rn) => [
    { rn, flavor: "locked", vitest: "4.1.9" },
    { rn, flavor: "latest-supported", vitest: "4.1.9" },
  ]);
  cells.push({ rn: "0.81", flavor: "v5", vitest: "5.0.0-beta.6" });
  cells.push({ rn: "0.87", flavor: "v5", vitest: "5.0.0-beta.6" });
  return cells;
})();

function tableRows(page: string): string[] {
  return page.split("\n").filter((l) => /^\|\s*0\.\d/.test(l));
}

describe("fidelity matrix cells", () => {
  it("renders cells that resolve to the same Vitest version as distinguishable rows", () => {
    const rows = tableRows(render(ALL_CELLS));
    expect(rows.length).toBe(ALL_CELLS.length);
    expect(new Set(rows).size).toBe(rows.length);
  });

  it("does not label a v5 cell as locked", () => {
    const page = render([
      { rn: "0.86", flavor: "locked", vitest: "4.1.9" },
      { rn: "0.87", flavor: "v5", vitest: "5.0.0-beta.6" },
    ]);
    expect(page).toContain("| v5 |");
    expect(tableRows(page).filter((r) => r.includes("| locked |")).length).toBe(1);
  });

  it("claims the full matrix only when every gated cell reported", () => {
    const page = render(ALL_CELLS);
    expect(page).toContain("Every probe matches on every gated React Native version.");
    expect(page).not.toContain("Incomplete matrix data");
  });

  it("qualifies the claim and names the gap when cells are missing", () => {
    const page = render(ALL_CELLS.filter((c) => !(c.rn === "0.84" && c.flavor === "locked")));
    expect(page).not.toContain("on every gated React Native version.");
    expect(page).toContain("Incomplete matrix data");
    expect(page).toContain("0.84-locked");
    expect(page).toContain(`missing 1 of the ${ALL_CELLS.length} gated cells`);
  });

  it("counts a wholly absent flavor as missing rather than passing silently", () => {
    const page = render(ALL_CELLS.filter((c) => c.flavor !== "v5"));
    expect(page).toContain("Incomplete matrix data");
    expect(page).toContain("0.81-v5");
    expect(page).toContain("0.87-v5");
  });
});
