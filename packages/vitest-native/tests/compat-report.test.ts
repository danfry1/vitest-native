/**
 * compat-report (.github/scripts/compat-report.mjs): which issue a failed compat check
 * files, and a body that keeps untrusted log text inside its fence.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { issueBody, issueFor } from "../../../.github/scripts/compat-report.mjs";

describe("compat-report", () => {
  it("maps each check to its issue, keeping the titles earlier runs used", () => {
    expect(issueFor("Expo module tables match the newest jest-expo of each SDK")?.title).toBe(
      "Expo module table differs from the newest jest-expo",
    );
    expect(issueFor("Check against current React Native edge")?.title).toBe(
      "Compatibility gap detected with latest react-native",
    );
    expect(issueFor("Supported Expo SDKs at their newest patch")?.title).toBe(
      "Compatibility: a supported Expo SDK fails at its newest patch",
    );
    expect(issueFor("Conformance on the newest supported libraries")?.title).toBe(
      "Library conformance: a supported library's newest release no longer matches",
    );
    expect(issueFor("Canary (react-native)")?.title).toBe(
      "Canary: the react-native prerelease fails",
    );
    expect(issueFor("File issues for failed checks")).toBeNull();
  });

  it("keeps the log tail inside a fence it cannot close", () => {
    const log = ["line 1", "```", "## injected heading", "````more"].join("\n");
    const body: string = issueBody({ text: "t", jobName: "j", runUrl: "u", log });
    const fences = body.split("\n").filter((line) => line.startsWith("```"));
    expect(fences).toEqual(["```text", "```"]);
    expect(body).toContain("~~~");
  });

  it("keeps only the last 40 log lines", () => {
    const log = Array.from({ length: 100 }, (_, i) => `l${i}`).join("\n");
    const body: string = issueBody({ text: "t", jobName: "j", runUrl: "u", log });
    expect(body).toContain("l99");
    expect(body).not.toContain("l59\n");
  });
});
