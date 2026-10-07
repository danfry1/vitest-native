import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs outside the package, no types
import { matrixFor, scopeFor } from "../../../.github/scripts/rn-matrix.mjs";

// native-rn-matrix.yml runs every cell on main, weekly and on manual runs, and the ends
// of the React Native range on pull requests. The definition is one file, which the
// fidelity scripts also read to publish the supported range.
const definition = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../../.github/rn-matrix.json"), "utf8"),
);
const cells = (m: {
  rn: string[];
  vitest: string[];
  include: { rn: string; vitest: string }[];
}) => [
  ...m.rn.flatMap((rn) => m.vitest.map((v) => `${rn}-${v}`)),
  ...m.include.map((c) => `${c.rn}-${c.vitest}`),
];

describe("the RN matrix selection", () => {
  it("runs every cell outside pull requests", () => {
    // merge_group: the last check before main is the complete one.
    for (const event of ["push", "schedule", "workflow_dispatch", "merge_group"]) {
      expect(scopeFor(event, [])).toBe("full");
    }
    expect(cells(matrixFor(definition, "full"))).toHaveLength(
      definition.rn.length * definition.vitest.length + definition.include.length,
    );
  });

  it("runs the range ends in every column on a pull request", () => {
    expect(scopeFor("pull_request", ["packages/vitest-native/src/plugin.ts"])).toBe("ends");
    const ends = matrixFor(definition, "ends");
    const first = definition.rn[0];
    const last = definition.rn.at(-1);
    expect(ends.rn).toEqual([first, last]);
    expect(ends.vitest).toEqual(definition.vitest);
    // Every Vitest column, including the Vitest 4 floor, still meets both ends.
    for (const column of [...definition.vitest, "v4"]) {
      expect(cells(ends)).toContain(`${first}-${column}`);
      expect(cells(ends)).toContain(`${last}-${column}`);
    }
  });

  it("runs every cell on a pull request that changes the matrix itself", () => {
    for (const file of [
      ".github/rn-matrix.json",
      ".github/scripts/rn-matrix.mjs",
      ".github/workflows/native-rn-matrix.yml",
    ]) {
      expect(scopeFor("pull_request", ["README.md", file]), file).toBe("full");
    }
  });
});
