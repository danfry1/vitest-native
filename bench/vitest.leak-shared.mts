// Native engine, isolate:false, single worker, fixed order — the "moat" config
// (RN stays hot, loaded once). This is the configuration whose safety is in
// question. Class A (user modules) tests whether isolate:false re-evaluates the
// user graph; Class B tests whether RN's externalized state leaks across files.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  resolve: { dedupe: ["react", "react-test-renderer", "react-is"] },
  test: {
    globals: true,
    environment: "node",
    include: ["leak/*.test.tsx"],
    isolate: false,
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    sequence: { shuffle: false },
    fileParallelism: false,
  },
});
