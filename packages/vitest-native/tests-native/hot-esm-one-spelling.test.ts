/**
 * One spelling per generation for an ES package under the hot runtime (#722, #719): a
 * file that imports and requires one ES package as published gets one instance of it,
 * the next file a new one, and the package names its real file in import.meta, stack
 * traces and source maps (reported errors; error.stack read inside a test is Vite's and
 * names the generation, as documented). The app (fixtures/esm-one-spelling) runs in one hot worker,
 * with React resident and with freshRuntime.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { runApp } from "./support/run-app";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/esm-one-spelling");
const FRESH = {
  file: "vitest.config.mts",
  find: "hotRuntime: { allowUnboundedMemory: true }",
  replace: "hotRuntime: { allowUnboundedMemory: true, freshRuntime: true }",
};
const REPORTED = {
  file: "vitest.config.mts",
  find: 'include: ["*.test.ts"],',
  replace: 'include: ["reported.check.ts"],',
};

it.each([
  ["hot", []],
  ["freshRuntime", [FRESH]],
])(
  "%s: one instance per file, named as its real file",
  (_, edits) => {
    const { status, output } = runApp("esm-one-spelling", { from: APP, edits });
    expect(status, output).toBe(0);
    expect(output).toMatch(/Tests\s+4 passed/);
  },
  150_000,
);

it.each([
  ["hot", [REPORTED]],
  ["freshRuntime", [REPORTED, FRESH]],
])(
  "%s: a reported error names the package's own source, through its source map",
  (_, edits) => {
    const { status, output } = runApp("esm-one-spelling", { from: APP, edits });
    expect(status, output).not.toBe(0);
    expect(output).toMatch(/vn-esm-one-spelling[\\/]src[\\/]index\.ts:4:\d+/);
    expect(output).not.toMatch(/vnhot/);
  },
  150_000,
);
