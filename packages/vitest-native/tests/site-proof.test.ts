import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { crossCheck, museum } from "../../../website/.vitepress/proof.ts";
import { SUPPORTED_REACT_NATIVE } from "../src/peer-requirements";

// The landing page's "How it's checked" cards read their numbers at build time
// (website/.vitepress/proof.ts). This holds each one to a second source, so a number on
// the page is one the repository holds. The ported tests' count needs a Vitest run of its
// own, so it is checked in site-proof.e2e.test.ts.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PACKAGE = path.join(repoRoot, "packages/vitest-native");

describe("the landing page's proof cards", () => {
  it("state the cross-check the fidelity badge states, over the supported React Native", () => {
    const badge = JSON.parse(
      fs.readFileSync(path.join(PACKAGE, "crosscheck/fidelity-badge.json"), "utf8"),
    );
    const read = crossCheck();
    expect(`${read.probesMatching}/${read.probes} probes`).toBe(badge.message);
    const { minimumMinor, maximumMinor } = SUPPORTED_REACT_NATIVE;
    expect(read.reactNative).toBe(`0.${minimumMinor}–0.${maximumMinor}`);
  });

  it("stop the build when the fidelity report's summary changes shape", () => {
    expect(() => crossCheck("# Fidelity report\n\n- **88 probes** pass.")).toThrow(/summary/);
  });

  it("count exhibits by their recorded proof, as status.mjs does", () => {
    const exhibits = [
      { status: { proof: "landed proven" } },
      { status: { proof: "guard proven" } },
      { status: { proof: "fix proven" } },
      { status: { proof: "fix proven (bug on buggyRef)" } },
      { status: { proof: "open (control passes)" } },
      { status: { proof: "NOT PROVEN" } },
      // Added since the last measurement: not counted.
      { status: {} },
      {},
    ];
    expect(museum({ exhibits })).toEqual({ measured: 6, proven: 4, open: 1 });
  });

  it("state the museum's numbers that its STATUS.md states", () => {
    const status = fs.readFileSync(path.join(PACKAGE, "validation/bug-museum/STATUS.md"), "utf8");
    const read = museum();
    expect(status).toContain(`**${read.measured} exhibits.**`);
    expect(status).toContain(`**Proof:** ${read.proven} proven against a build without the bug`);
    expect(status).toContain(`${read.open} open bugs fail on main as their bug`);
  });

  it("are the landing page's only numbers about how it's checked", () => {
    const landing = fs.readFileSync(path.join(repoRoot, "website/index.md"), "utf8");
    const section = landing.slice(landing.indexOf("## How it's checked"));
    const body = section.slice(0, section.indexOf("\n## ", 1));
    expect(body).toContain("<ProofCards />");
    expect(body).not.toMatch(/\d/);
  });
});
