import { describe, expect, it } from "vitest";
// @ts-expect-error -- a plain .mjs script with no type declarations
import { notRun, selectDocsChecks } from "../scripts/docs-checks.mjs";

// `test:docs` (scripts/docs-checks.mjs) lists the tests that read repository Markdown and
// runs them. A listed file that the run's config excludes used to be skipped in silence
// (#890): the e2e tests are excluded from vitest.config.ts and run under their own config.
describe("test:docs", () => {
  it("runs the listed e2e tests under the e2e config, not the unit config", () => {
    const { unit, e2e } = selectDocsChecks();
    expect(e2e).toContain("site-proof.e2e.test.ts");
    expect(unit.filter((file: string) => file.endsWith(".e2e.test.ts"))).toEqual([]);
    expect(unit.length).toBeGreaterThan(5);
  });

  it("names every listed file that the run did not report", () => {
    const report = {
      testResults: [
        { name: "/repo/tests/a.test.ts", assertionResults: [{ status: "passed" }] },
        { name: "/repo/tests/b.test.ts", assertionResults: [{ status: "skipped" }] },
        { name: "/repo/tests/c.test.ts", assertionResults: [{ status: "failed" }] },
      ],
    };
    expect(notRun(["a.test.ts", "b.test.ts", "c.test.ts", "d.e2e.test.ts"], report)).toEqual([
      "b.test.ts",
      "d.e2e.test.ts",
    ]);
  });
});
