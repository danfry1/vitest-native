import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyObservation,
  classifyObservationVerdict,
  confirmObservation,
  statusChanges,
  testStatuses,
} from "../scripts/bakeoff-observation.mjs";

describe("external bake-off observation classification", () => {
  it("describes a lower count as changed rather than a product regression", () => {
    expect(classifyObservation({ passed: 9, total: 10 }, { passed: 10, total: 10 })).toBe(
      "CHANGED",
    );
  });

  it("requires investigation when test discovery changes the total", () => {
    expect(classifyObservation({ passed: 11, total: 12 }, { passed: 10, total: 10 })).toBe(
      "CHANGED",
    );
  });

  it("keeps infrastructure failures distinct from changed observations", () => {
    expect(classifyObservationVerdict({ changed: false, infra: true })).toBe("infra");
    expect(classifyObservationVerdict({ changed: true, infra: false })).toBe("changed");
    expect(classifyObservationVerdict({ changed: true, infra: true })).toBe("mixed");
  });
});

describe("the ratchet script guards unmeasurable runs", () => {
  // The script died with an unhandled ENOENT when a measurement produced nothing: it
  // carried on to read a config the failed run had left incomplete, so the step exited
  // before classifying and the workflow filed every failure as "(infra?)" — unable to
  // tell a broken setup from a real regression. Two scheduled runs failed that way
  // before anyone looked. A static check, because reproducing it needs a network-heavy
  // multi-minute real-app run.
  const source = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "bakeoff-ratchet.mjs"),
    "utf8",
  );

  it("checks every collectCounts result before using it", () => {
    // Each measurement is assigned, then must be null-checked somewhere after. Kept
    // deliberately simple: an earlier version demanded a blank line within 400
    // characters of the call and silently matched only one of the two sites, which
    // would have reported success while half the code went unchecked.
    const assignments = [...source.matchAll(/const (\w+) = collectCounts\(/g)].map((m) => ({
      name: m[1],
      from: m.index ?? 0,
    }));
    expect(assignments.map((a) => a.name).sort()).toEqual(["confirm", "hot", "stock"]);

    const unguarded = assignments.filter(
      ({ name, from }) => !new RegExp(`if \\(!${name}\\)`).test(source.slice(from)),
    );
    expect(unguarded.map((u) => u.name)).toEqual([]);
  });

  it("treats an unmeasurable run as infrastructure, never as a changed observation", () => {
    // classifyObservationVerdict is what the workflow branches on for the issue title.
    expect(classifyObservationVerdict({ changed: false, infra: true })).toBe("infra");
    expect(classifyObservationVerdict({ changed: true, infra: true })).toBe("mixed");
  });
});

describe("per-test observation evidence", () => {
  const report = (tests: [string, string, string][], failedFile?: string) => ({
    testResults: [
      ...Object.entries(
        tests.reduce<Record<string, { fullName: string; status: string }[]>>((files, [f, n, s]) => {
          (files[f] ??= []).push({ fullName: n, status: s });
          return files;
        }, {}),
      ).map(([name, assertionResults]) => ({
        name: `/app/${name}`,
        status: "passed",
        assertionResults,
      })),
      ...(failedFile
        ? [{ name: `/app/${failedFile}`, status: "failed", assertionResults: [] }]
        : []),
    ],
  });

  it("keys tests by relative file and full name, keeping repeated names apart", () => {
    const statuses = testStatuses(
      report([
        ["a.test.ts", "renders", "passed"],
        ["a.test.ts", "renders", "failed"],
      ]),
      "/app",
    );
    expect([...statuses]).toEqual([
      ["a.test.ts > renders", "passed"],
      ["a.test.ts > renders #2", "failed"],
    ]);
  });

  it("records a file that failed to load, which contributes no tests", () => {
    expect(
      testStatuses(report([], "broken.test.ts"), "/app").get(
        "broken.test.ts > (file failed to load)",
      ),
    ).toBe("failed");
  });

  it("names exactly the tests whose outcome differs between runs", () => {
    const before = testStatuses(
      report([
        ["a.test.ts", "x", "passed"],
        ["a.test.ts", "y", "passed"],
      ]),
      "/app",
    );
    const after = testStatuses(
      report([
        ["a.test.ts", "x", "failed"],
        ["b.test.ts", "z", "passed"],
      ]),
      "/app",
    );
    expect(statusChanges(before, after)).toEqual([
      { test: "a.test.ts > x", from: "passed", to: "failed" },
      { test: "a.test.ts > y", from: "passed", to: "absent" },
      { test: "b.test.ts > z", from: "absent", to: "passed" },
    ]);
  });

  it("reports a drop that a confirming run does not reproduce as flaky, not changed", () => {
    const baseline = { passed: 645, total: 715 };
    expect(
      confirmObservation({ passed: 644, total: 715 }, { passed: 645, total: 715 }, baseline),
    ).toBe("FLAKY");
    expect(
      confirmObservation({ passed: 644, total: 715 }, { passed: 644, total: 715 }, baseline),
    ).toBe("CHANGED");
    expect(confirmObservation({ passed: 645, total: 715 }, { passed: 0, total: 0 }, baseline)).toBe(
      "OK",
    );
  });
});
