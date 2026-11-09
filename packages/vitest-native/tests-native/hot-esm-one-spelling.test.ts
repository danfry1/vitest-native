/**
 * One spelling per generation for an ES package under the hot runtime (#722, #719): a
 * file that imports and requires one ES package as published gets one instance of it,
 * the next file a new one, and the package names its real file in import.meta, stack
 * traces and source maps. The app (fixtures/esm-one-spelling) runs in one hot worker,
 * with React resident and with freshRuntime, source maps off and on.
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
const MAPS = {
  file: "vitest.config.mts",
  find: "execArgv: [],",
  replace: 'execArgv: ["--enable-source-maps"],',
};

it.each([
  ["hot", []],
  ["hot, source maps", [MAPS]],
  ["freshRuntime", [FRESH]],
  ["freshRuntime, source maps", [FRESH, MAPS]],
])(
  "%s: one instance per file, named as its real file",
  (_, edits) => {
    const { status, output } = runApp("esm-one-spelling", { from: APP, edits });
    expect(status, output).toBe(0);
    expect(output).toMatch(/Tests\s+4 passed/);
  },
  150_000,
);
