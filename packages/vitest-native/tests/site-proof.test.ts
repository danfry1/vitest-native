import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { crossCheck, museum, portedTests } from "../../../website/.vitepress/proof.ts";
import { SUPPORTED_REACT_NATIVE } from "../src/peer-requirements";

// The landing page's "How it's checked" cards read their numbers at build time
// (website/.vitepress/proof.ts). This holds each reader to a second source, so a number
// on the page is one the repository holds.
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
    expect(read.apisReached).toBeLessThanOrEqual(read.apis);
    expect(read.componentsReached).toBeLessThanOrEqual(read.components);
  });

  it("stop the build when the fidelity report's summary changes shape", () => {
    expect(() => crossCheck("# Fidelity report\n\n- **88 probes** pass.")).toThrow(/summary/);
  });

  it("count proven and open exhibits by their recorded proof", () => {
    const exhibits = [
      { status: { proof: "landed proven" } },
      { status: { proof: "guard proven" } },
      { status: { proof: "fix proven" } },
      { status: { proof: "open (control passes)" } },
      { status: { proof: "NOT PROVEN" } },
      {},
    ];
    expect(museum({ exhibits })).toEqual({ exhibits: 6, proven: 3, open: 1 });

    const read = museum();
    const file = JSON.parse(
      fs.readFileSync(path.join(PACKAGE, "validation/bug-museum/exhibits.json"), "utf8"),
    );
    expect(read.exhibits).toBe(file.exhibits.length);
    expect(read.proven + read.open).toBeLessThanOrEqual(read.exhibits);
  });

  it("count every ported React Native test, wherever its call starts", () => {
    const dir = path.join(PACKAGE, "tests/rn-conformance");
    const sources = fs
      .readdirSync(dir)
      .map((file) => fs.readFileSync(path.join(dir, file), "utf8"))
      .join("\n");
    const read = portedTests();
    expect(read.tests).toBe(sources.match(/\b(?:it|test)(?:\.skip)?\(/g)?.length);
    expect(read.skipped).toBe(sources.match(/\b(?:it|test)\.skip\(/g)?.length ?? 0);
    expect(read.areas).toContain("Animated");
  });

  it("are the landing page's only numbers about how it's checked", () => {
    const landing = fs.readFileSync(path.join(repoRoot, "website/index.md"), "utf8");
    const section = landing.slice(landing.indexOf("## How it's checked"));
    const body = section.slice(0, section.indexOf("\n## ", 1));
    expect(body).toContain("<ProofCards />");
    expect(body).not.toMatch(/\d/);
  });
});
