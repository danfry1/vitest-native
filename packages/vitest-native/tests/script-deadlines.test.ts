/**
 * The per-script CI deadlines (scripts/ci/script-deadlines.mjs): each names a script
 * that test:native runs, covers every CI platform, and sits above the slowest green run
 * its comment records. A deadline under a healthy run fails main with nothing hung, as
 * the single 600 s deadline did for test:native:ownership on Windows.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { SCRIPT_DEADLINES, deadlineFor } from "../scripts/ci/script-deadlines.mjs";

const packageRoot = path.resolve(import.meta.dirname, "..");
const scripts: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
).scripts;
const source = fs.readFileSync(path.join(packageRoot, "scripts/ci/script-deadlines.mjs"), "utf8");
const table = SCRIPT_DEADLINES as Record<string, Record<string, number>>;

describe("per-script CI deadlines", () => {
  it("name scripts that test:native runs, on every CI platform", () => {
    for (const [script, byPlatform] of Object.entries(table)) {
      expect([script, scripts["test:native"].split(" ").includes(script)]).toEqual([script, true]);
      expect([script, Object.keys(byPlatform).sort()]).toEqual([
        script,
        ["darwin", "linux", "win32"],
      ]);
    }
  });

  it("sit at least 1.5x above the slowest green run each one records", () => {
    for (const [script, byPlatform] of Object.entries(table)) {
      // The comment above the row: "win 558.1 s (…), mac 412.8 s, linux 407.5 s."
      const row = source.indexOf(`"${script}"`);
      const comment = source.slice(source.lastIndexOf("//", row), row);
      const measured = {
        win32: /win ([\d.]+) s/.exec(comment)?.[1],
        darwin: /mac ([\d.]+) s/.exec(comment)?.[1],
        linux: /linux ([\d.]+) s/.exec(comment)?.[1],
      };
      for (const [platform, seconds] of Object.entries(measured)) {
        expect([script, platform, seconds !== undefined]).toEqual([script, platform, true]);
        expect([script, platform, byPlatform[platform] >= Number(seconds) * 1000 * 1.5]).toEqual([
          script,
          platform,
          true,
        ]);
      }
    }
  });

  it("start first in test:native, longest first", () => {
    // run-scripts starts scripts in the order given, a few at a time, so the longest has
    // to start first or it becomes the tail of the run (ownership started 18th of 24).
    const order = scripts["test:native"].split(" ").filter((part) => part.startsWith("test:"));
    const listed = Object.keys(table).sort((a, b) => table[b].win32 - table[a].win32);
    expect(order.slice(0, listed.length)).toEqual(listed);
  });

  it("fall back to the run's default for every other script", () => {
    expect(deadlineFor("test:native:main", 600_000, "win32")).toBe(600_000);
    expect(deadlineFor("test:native:project-babel", 600_000, "win32")).toBe(11 * 60_000);
  });
});
