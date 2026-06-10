// Mock engine: RN replaced wholesale by vitest-native's hand-written mocks (no
// real RN graph). The speed ceiling — and the fidelity floor — of the spectrum.
// Worker count via BENCH_WORKERS.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const W = Number(process.env.BENCH_WORKERS || 1);

export default defineConfig({
  plugins: [reactNative({ engine: "mock" })],
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
