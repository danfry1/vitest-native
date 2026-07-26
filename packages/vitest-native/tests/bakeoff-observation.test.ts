import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyObservation,
  classifyObservationVerdict,
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
    expect(assignments.map((a) => a.name).sort()).toEqual(["hot", "stock"]);

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
