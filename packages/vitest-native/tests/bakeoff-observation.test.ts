import { describe, expect, it } from "vitest";
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
