// The hot scale suite at one worker, for the resolver count gate (ADR-0005): the same
// files as vitest.hot.mts, with experimental.ownershipModel on when VN_OWNERSHIP=1, and
// a setup file that writes this worker's resolution counters after every file.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../../../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: { allowUnboundedMemory: true },
      ...(process.env.VN_OWNERSHIP === "1" ? { experimental: { ownershipModel: "resolver" } } : {}),
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    sequence: { shuffle: false },
    setupFiles: [path.resolve(here, "counts.setup.ts")],
    include: [path.resolve(here, "generated/*.test.tsx")],
  },
});
