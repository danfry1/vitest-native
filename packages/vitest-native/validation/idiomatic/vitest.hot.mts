// Same idiomatic suite, hotRuntime ON — the comparison oracle for hot
// correctness on a normal vitest-first app (no jest-compat, no monkeypatching).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: true })],
  test: {
    globals: true,
    environment: "node",
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    sequence: { shuffle: false },
    include: [path.resolve(here, "*.test.tsx")],
  },
});
