/**
 * The RN matrix's latest-supported column installs the newest release of each peer's
 * newest supported major (.github/scripts/latest-supported.mjs), read from the same peer
 * requirements the startup checks enforce, so a range change moves the column too.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { latestSupportedSpecs } from "../../../.github/scripts/latest-supported.mjs";
import { PEER_REQUIREMENTS } from "../src/peer-requirements";

describe("latest-supported specs", () => {
  it("installs every capped peer at its newest supported major, with Vitest's coverage provider in lockstep", () => {
    const specs: string[] = latestSupportedSpecs();
    for (const peer of PEER_REQUIREMENTS.filter((p) => p.maximumMajor !== undefined)) {
      expect(specs).toContain(`${peer.name}@^${peer.maximumMajor! - 1}`);
    }
    const vitest = specs.find((s) => s.startsWith("vitest@"))!;
    expect(specs).toContain(`@vitest/coverage-v8@${vitest.slice("vitest@".length)}`);
  });

  it("follows a range change", () => {
    expect(
      latestSupportedSpecs([
        { name: "vitest", minimum: "6.0.0", maximumMajor: 7 },
        { name: "react", minimum: "19.0.0" },
      ]),
    ).toEqual(["vitest@^6", "@vitest/coverage-v8@^6"]);
  });
});
