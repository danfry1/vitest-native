import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as presets from "../src/presets/index.js";
import { AUTO_DETECT_PRESETS, SELF_TESTING_FROM_MAJOR } from "../src/preset-map.js";

// The preset tables are claims about what the package shadows. They had drifted: the
// site listed 11 of 17 presets, and the package README mapped vectorIcons to the
// legacy package it deliberately does not cover. Every table is now checked against
// the preset factories themselves, so a preset change that leaves a table behind fails
// here rather than reaching users.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TABLES = ["website/guide/presets.md", "README.md", "packages/vitest-native/README.md"];

type Row = { name: string; packages: string[]; text: string };

function presetRows(file: string): Row[] {
  const text = fs.readFileSync(path.join(repoRoot, file), "utf8");
  return [...text.matchAll(/^\|\s*`presets\.(\w+)\(\)`\s*\|([^|\n]*)\|([^\n]*)$/gm)].map((m) => ({
    name: m[1],
    packages: [...m[2].matchAll(/`([^`]+)`/g)].map((p) => p[1]).sort(),
    text: m[0],
  }));
}

const factories = Object.entries(presets) as [string, () => { modules: object }][];
const shadowed = (name: string) =>
  Object.keys(factories.find(([n]) => n === name)![1]().modules).sort();

describe.each(TABLES)("%s preset table", (file) => {
  const rows = presetRows(file);

  it("lists every preset the package exports, once", () => {
    expect(rows.map((r) => r.name).sort()).toEqual(factories.map(([n]) => n).sort());
  });

  it("names exactly the packages each preset shadows", () => {
    for (const row of rows) expect(row.packages, row.name).toEqual(shadowed(row.name));
  });

  it("says from which major a package tests itself", () => {
    for (const [pkg, major] of Object.entries(SELF_TESTING_FROM_MAJOR)) {
      const preset = AUTO_DETECT_PRESETS[pkg as keyof typeof AUTO_DETECT_PRESETS];
      const row = rows.find((r) => r.name === preset);
      expect(row?.text, pkg).toContain(`tests itself from v${major}`);
    }
  });
});
