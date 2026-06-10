// Native engine with the HOT RUNTIME: persistent workers, RN loads once per
// worker, per-file isolation preserved via the worker-side isolate flip + the
// surgical reset manifest. Worker count via BENCH_WORKERS. NOTE: with a single
// worker the scheduler batches all files into one task (groupSpecs), so RN boots
// exactly once for the whole suite — the best case the hot runtime exists for.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const W = Number(process.env.BENCH_WORKERS || 1);

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: true })],
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
