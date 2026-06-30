// Hot runtime with multi-worker recycling — the recommended config for large
// suites. Recycling retires a worker after N files, freeing its accumulated
// resident graph, so peak memory is bounded instead of climbing linearly.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../../../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const workers = Number(process.env.VN_WORKERS ?? 4);

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: { recycleAfterFiles: 40 } })],
  test: {
    globals: true,
    environment: "node",
    maxWorkers: workers,
    minWorkers: workers,
    fileParallelism: true,
    sequence: { shuffle: false },
    include: [path.resolve(here, "generated/*.test.tsx")],
  },
});
