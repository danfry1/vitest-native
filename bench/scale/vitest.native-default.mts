// Native engine as a user gets it out of the box: no hotRuntime option, so the
// default 'auto' decides — the bounded hot runtime when the run can be bounded and
// recycled, per-file isolation otherwise. Worker count via BENCH_WORKERS.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const W = Number(process.env.BENCH_WORKERS || 1);

export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  resolve: { dedupe: ["react", "react-test-renderer", "react-is"] },
  test: {
    globals: true,
    environment: "node",
    include: ["scale/__suite__/*.test.tsx"],
    maxWorkers: W,
    minWorkers: W,
    fileParallelism: W > 1,
  },
});
