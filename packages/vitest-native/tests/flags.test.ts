// The flag table (src/flags.ts, ADR-0001): every behaviour change still behind a flag
// is listed with the record that owns it and its decision date; at most two are live;
// a flag past its date with no decision fails here, which blocks the release.
import { describe, expect, it } from "vitest";
import { EXPERIMENTAL_FLAGS, MAX_LIVE_FLAGS } from "../src/flags.js";
import { validateOptions } from "../src/validate.js";

describe("the flag table", () => {
  it("has no more live flags than the budget", () => {
    expect(EXPERIMENTAL_FLAGS.length).toBeLessThanOrEqual(MAX_LIVE_FLAGS);
  });

  it("names a real option for each entry, which validation accepts", () => {
    for (const flag of EXPERIMENTAL_FLAGS) {
      const [, key] = flag.name.split(".");
      expect(flag.name.startsWith("experimental.")).toBe(true);
      expect(() => validateOptions({ experimental: { [key]: "resolver" } })).not.toThrow();
    }
  });

  it("has no entry past its decision date", () => {
    for (const flag of EXPERIMENTAL_FLAGS) {
      expect(flag.decideBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Date.parse(flag.decideBy), `${flag.name} is past ${flag.decideBy}`).toBeGreaterThan(
        Date.now(),
      );
    }
  });
});

describe("experimental options", () => {
  it("refuses an unknown key, and a value other than 'resolver'", () => {
    expect(() => validateOptions({ experimental: { other: true } })).toThrow(
      /Unknown experimental/,
    );
    expect(() => validateOptions({ experimental: { ownershipModel: true } })).toThrow(
      /must be "resolver"/,
    );
    expect(() => validateOptions({ experimental: [] })).toThrow(/must be an object/);
  });
});
