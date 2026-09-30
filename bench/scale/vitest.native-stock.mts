// Native engine, STOCK: hotRuntime:false, so Vitest's isolate:true applies — fresh
// worker (and fresh RN graph) per file. This is the baseline the hot runtime is
// measured against. Worker count via BENCH_WORKERS.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const W = Number(process.env.BENCH_WORKERS || 1);

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false })],
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
