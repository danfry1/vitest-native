/**
 * lint/baseline.json lists the sites that predate a lint rule, each with a reason. It may
 * only shrink: a new site fixes the code, or comes with its own reasoned entry, which
 * raises a ceiling below in the same change for review.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(
  fs.readFileSync(path.join(PACKAGE, "lint/baseline.json"), "utf8"),
) as Record<string, Record<string, { count: number; reason: string }>>;

/** The most sites each rule may have listed. Lower these as sites are fixed. */
const CEILING: Record<string, number> = {
  "no-monkey-patching": 22,
  "realpath-spelling": 2,
  "escaped-regexp": 10,
  "root-containment": 12,
};

describe("lint baseline", () => {
  it("lists no more sites than each rule's ceiling", () => {
    for (const [rule, files] of Object.entries(baseline)) {
      const total = Object.values(files).reduce((sum, entry) => sum + entry.count, 0);
      expect([rule, total <= (CEILING[rule] ?? 0)]).toEqual([rule, true]);
    }
  });

  it("gives every entry a reason and names a file that exists", () => {
    for (const [rule, files] of Object.entries(baseline)) {
      for (const [file, entry] of Object.entries(files)) {
        expect([rule, file, entry.reason.length > 20]).toEqual([rule, file, true]);
        expect([rule, file, Number.isInteger(entry.count) && entry.count > 0]).toEqual([
          rule,
          file,
          true,
        ]);
        expect([rule, file, fs.existsSync(path.join(PACKAGE, file))]).toEqual([rule, file, true]);
      }
    }
  });
});
