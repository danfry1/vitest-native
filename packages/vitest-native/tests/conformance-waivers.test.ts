/**
 * Every conformance waiver names the issue that tracks its gap, or a reason the gap can
 * never close (tests-native/conformance/waivers.ts). Checked here on every file, so an
 * untracked waiver fails the unit suite on every leg, not only where its probe runs.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERMANENT_REASONS, waiverProblems } from "../tests-native/conformance/waivers";

const dir = path.join(import.meta.dirname, "../tests-native/conformance");
const files = fs.readdirSync(dir).filter((file) => file.endsWith("waivers.json"));

describe("waiverProblems", () => {
  const waiver = { export: "useThing", reason: "the mock lacks it" };

  it("accepts an issue or a permanent reason", () => {
    expect(waiverProblems([{ ...waiver, issue: "#782" }])).toEqual([]);
    for (const issue of PERMANENT_REASONS)
      expect(waiverProblems([{ ...waiver, issue }])).toEqual([]);
  });

  it("rejects a waiver that names no issue that tracks it", () => {
    for (const issue of ["n/a (mock engine preset)", "n/a", "", "782", "#0", "#782 later"]) {
      expect(waiverProblems([{ ...waiver, issue }])).toHaveLength(1);
    }
    expect(waiverProblems([{ export: "useThing", reason: "x" }])).toHaveLength(1);
  });

  it("rejects a waiver with no reason", () => {
    expect(waiverProblems([{ export: "useThing", reason: " ", issue: "#782" }])).toEqual([
      "useThing: no reason",
    ]);
  });
});

it("finds the waiver files", () => {
  expect(files.length).toBeGreaterThan(0);
});

it.each(files)("%s: every waiver names an issue or a permanent reason", (file) => {
  const waivers = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  expect(waiverProblems(waivers)).toEqual([]);
});
