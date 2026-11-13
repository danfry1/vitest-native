/**
 * Under the hot runtime, an ES module in node_modules that imports a preset package links
 * the preset module of the file running, not the first file's. The bug-museum exhibit
 * pfs-hot-preset-esm-generation runs three files on one hot worker. Each mocks the
 * safe-area insets, then checks:
 * - an ES library reads that value;
 * - the file's call assertions see the library's calls;
 * - an import and a CommonJS require give the same mock;
 * - two ES libraries share one preset module (one evaluation per file, not per importer).
 * Also run with freshRuntime, and per file (hotRuntime: false), where it always held.
 */
import { expect, it } from "vitest";
import { runApp } from "./support/run-app";

const HOT = "hotRuntime: { allowUnboundedMemory: true }";

it.each([
  ["hot", []],
  [
    "hot, freshRuntime",
    [
      {
        file: "vitest.config.mts",
        find: HOT,
        replace: "hotRuntime: { allowUnboundedMemory: true, freshRuntime: true }",
      },
    ],
  ],
  ["per file", [{ file: "vitest.config.mts", find: HOT, replace: "hotRuntime: false" }]],
] as const)(
  "%s: every file's ES imports see that file's preset mock",
  (_, edits) => {
    const { status, output } = runApp("pfs-hot-preset-esm-generation", { edits: [...edits] });
    expect(status, output).toBe(0);
    expect(output).toMatch(/Tests\s+12 passed \(12\)/);
  },
  150_000,
);
