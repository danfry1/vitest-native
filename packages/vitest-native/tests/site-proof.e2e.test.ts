import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { portedTests } from "../../../website/.vitepress/proof.ts";

// The landing page's "ported React Native tests" card reads tests/rn-conformance/counts.json
// (website/.vitepress/proof.ts). This runs those tests and holds the file to Vitest's own
// count. It starts a Vitest run, so it is end-to-end; site-proof.test.ts checks the other
// cards from the files alone.
const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("the landing page's ported-tests card", () => {
  it("counts the ported React Native tests as Vitest runs them", () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rn-conformance-")), "out.json");
    // A run of its own, outside this worker's Vitest environment.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST")),
    );
    execFileSync(
      process.execPath,
      [
        path.join(PACKAGE, "node_modules/vitest/vitest.mjs"),
        "run",
        "tests/rn-conformance",
        "--reporter=json",
        `--outputFile=${out}`,
      ],
      { cwd: PACKAGE, env, stdio: "ignore" },
    );
    const report = JSON.parse(fs.readFileSync(out, "utf8"));
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
    const read = portedTests();
    // When this fails, write Vitest's counts into tests/rn-conformance/counts.json.
    expect({ tests: read.tests, skipped: read.skipped }).toEqual({
      tests: report.numTotalTests,
      skipped: report.numPendingTests + report.numTodoTests,
    });
    expect(read.areas).toContain("Animated");
  }, 60_000);
});
