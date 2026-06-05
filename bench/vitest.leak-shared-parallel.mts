// Native engine, isolate:false, DEFAULT parallelism (no singleThread). With 5
// files and many cores, each file lands on its own fresh worker, so cross-file
// sharing never happens and the leak is MASKED — this reproduces why an earlier
// "isolate:false is safe" measurement was a small-suite/parallelism artifact.
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
    sequence: { shuffle: false },
  },
});
