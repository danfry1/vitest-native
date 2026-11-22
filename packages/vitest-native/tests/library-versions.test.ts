/**
 * SUPPORTED_LIBRARY_VERSIONS (preset-map.ts) is the one table of supported library
 * versions: the presets guide states the same ranges, and the versions this repository
 * locks are inside them.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { satisfiesNodeRange } from "../src/node-range";
import { SUPPORTED_LIBRARY_VERSIONS } from "../src/preset-map";

const here = path.dirname(createRequire(import.meta.url).resolve("./library-versions.test.ts"));
const guide = fs.readFileSync(path.join(here, "../../../website/guide/presets.md"), "utf8");

describe("supported library versions", () => {
  it("are the table the presets guide shows, row for row", () => {
    const section = guide.slice(guide.indexOf("## Supported library versions"));
    const rows = [...section.matchAll(/^\| `([^`]+)` \| `([^`]+)` \|$/gm)].map(([, pkg, range]) => [
      pkg,
      range,
    ]);
    expect(Object.fromEntries(rows)).toEqual(SUPPORTED_LIBRARY_VERSIONS);
  });

  it("include the versions this repository locks", () => {
    const load = createRequire(path.join(here, "../package.json"));
    for (const [pkg, range] of Object.entries(SUPPORTED_LIBRARY_VERSIONS)) {
      const { version } = load(`${pkg}/package.json`) as { version: string };
      expect(satisfiesNodeRange(version, range), `${pkg} ${version} in ${range}`).toBe(true);
    }
  });
});
