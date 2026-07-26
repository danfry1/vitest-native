/**
 * The published fidelity numbers are a ratchet, not a rendering.
 *
 * Probes can stop registering without anything going red: an import that throws,
 * a `describe` that never runs, a helper that returns early. The arithmetic stays
 * honest while the evidence behind it disappears — 12/12 reads as "100%" and the
 * badge stays brightgreen. Comparing artifacts for equality does notice the
 * change, but classifies it as staleness, and the remedy it prints ("regenerate
 * and commit") is precisely the step that republishes the smaller corpus as a
 * pass. Before this guard, a corpus shrinking 81 → 12 could be walked back to
 * green by following the instructions the tool itself printed.
 *
 * These run the real script against a crafted report so the exit codes are the
 * ones CI would see. Only `--check` is exercised: it never writes, so the
 * committed badge and page cannot be disturbed by a failing test run.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(packageRoot, "scripts", "fidelity-report.mjs");
const reportPath = path.join(packageRoot, "crosscheck", ".out", "report.json");
const badgePath = path.join(packageRoot, "crosscheck", "fidelity-badge.json");

/** The floor the script ratchets against: the count in the committed badge. */
function committedProbeCount(): number {
  const badge = JSON.parse(fs.readFileSync(badgePath, "utf8"));
  const matched = /(\d+)\s*\/\s*(\d+)\s+probes/.exec(badge.message);
  if (!matched) throw new Error(`Unreadable badge message: ${badge.message}`);
  return Number(matched[2]);
}

function writeReport(total: number): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        reactNativeVersion: "0.86.0",
        vitestVersion: "4.0.0",
        generatedAt: "2026-01-01T00:00:00.000Z",
        summary: { total, matching: total },
        probes: Array.from({ length: total }, (_, i) => ({ name: `probe-${i}`, match: true })),
      },
      null,
      2,
    )}\n`,
  );
}

function runCheck(...extraArgs: string[]) {
  const res = spawnSync(process.execPath, [script, "--check", "--no-run", ...extraArgs], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  return { status: res.status, output: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

describe("fidelity corpus floor", () => {
  let saved: string | null = null;
  const floor = committedProbeCount();

  beforeAll(() => {
    saved = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : null;
  });

  afterAll(() => {
    if (saved === null) fs.rmSync(reportPath, { force: true });
    else fs.writeFileSync(reportPath, saved);
  });

  it("fails when the corpus shrinks below the published count", () => {
    writeReport(Math.max(1, Math.floor(floor / 4)));
    const { status, output } = runCheck();
    expect(status).toBe(1);
    expect(output).toContain("corpus shrank");
  });

  it("does not tell the reader to regenerate, which would republish the shrunken corpus", () => {
    writeReport(Math.max(1, Math.floor(floor / 4)));
    const { output } = runCheck();
    // The staleness path prints this; the shrink path must not, or the remedy
    // launders the regression.
    expect(output).not.toContain("run `bun run fidelity:report` and commit");
  });

  it("reports how many probes stopped reporting", () => {
    const total = Math.max(1, floor - 3);
    writeReport(total);
    const { output } = runCheck();
    expect(output).toContain(`${floor - total} probe(s) stopped reporting`);
  });

  it("allows a deliberate reduction behind an explicit flag", () => {
    writeReport(Math.max(1, Math.floor(floor / 4)));
    const { output } = runCheck("--allow-corpus-shrink");
    expect(output).not.toContain("corpus shrank");
  });

  it("does not block growth", () => {
    writeReport(floor + 5);
    const { output } = runCheck();
    expect(output).not.toContain("corpus shrank");
  });

  it("does not block a corpus that exactly matches the published count", () => {
    writeReport(floor);
    const { output } = runCheck();
    expect(output).not.toContain("corpus shrank");
  });
});
