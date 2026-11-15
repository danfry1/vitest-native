import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../../../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const workers = Number(process.env.VN_WORKERS ?? 1);

export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      // VN_FRESH=1: hotRuntime.freshRuntime (React, its renderers, scheduler and RNTL per
      // file), as run-compare.mjs's freshRuntime pass sets it.
      hotRuntime: {
        ...(workers === 1 ? { allowUnboundedMemory: true } : {}),
        ...(process.env.VN_FRESH === "1" ? { freshRuntime: true } : {}),
      },
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    maxWorkers: workers,
    minWorkers: workers,
    fileParallelism: workers > 1,
    sequence: { shuffle: false },
    include: [path.resolve(here, "generated/*.test.tsx")],
  },
});
