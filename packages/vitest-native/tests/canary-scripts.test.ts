/**
 * The canary's helpers (.github/scripts): which prerelease a channel installs, and the
 * job-local raise of a peer ceiling that lets a next major be tested rather than refused.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { canaryVersion, compareVersions } from "../../../.github/scripts/canary-version.mjs";
// @ts-expect-error — runtime .mjs, no types
import { FILE, raiseCeiling } from "../../../.github/scripts/raise-peer-ceiling.mjs";

describe("canaryVersion", () => {
  it("takes the newest channel ahead of latest", () => {
    expect(
      canaryVersion({ latest: "0.88.1", next: "0.89.0-rc.0", nightly: "0.90.0-nightly-1" }),
    ).toBe("0.89.0-rc.0");
    expect(canaryVersion({ latest: "5.1.0", beta: "6.0.0-beta.2", rc: "6.0.0-beta.10" })).toBe(
      "6.0.0-beta.10",
    );
  });

  it("skips channels that went stale behind latest", () => {
    expect(canaryVersion({ latest: "5.1.0", beta: "5.1.0-beta.1", rc: "5.0.0-rc.4" })).toBeNull();
    expect(canaryVersion({ latest: "58.0.23", next: "58.0.11" })).toBeNull();
  });

  it("orders versions as semver does", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0-beta.10", "1.0.0-beta.2")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
  });
});

describe("raiseCeiling", () => {
  const source = fs.readFileSync(FILE, "utf8");

  it("admits a next major for the named peer only", () => {
    const raised: string = raiseCeiling(source, "vitest", "6.0.0-beta.1");
    expect(raised).toMatch(/name: "vitest", minimum: "[^"]+", maximumMajor: 7/);
    expect(raised).toMatch(/name: "vite", minimum: "[^"]+", maximumMajor: 9/);
  });

  it("leaves a version already in range alone, and fails on an unknown peer", () => {
    expect(raiseCeiling(source, "vitest", "5.2.0")).toBe(source);
    expect(() => raiseCeiling(source, "left-pad", "2.0.0")).toThrow(/no maximumMajor/);
  });
});
