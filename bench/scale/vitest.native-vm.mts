// Native engine on Vitest's own vmThreads pool: the worker thread is reused while
// each test file gets a fresh VM context — including fresh copies of externalized
// modules, so React Native is re-instantiated per file with no custom pool and no
// resident-state bleed. Measured against native-stock (fresh worker per file) and
// native-hot (custom pool, resident RN).
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
    pool: "vmThreads",
    maxWorkers: W,
    minWorkers: W,
    fileParallelism: W > 1,
  },
});
