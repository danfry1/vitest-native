// Native engine, isolate:true, single worker, fixed order. Per our pool spike,
// isolate:true makes Vitest spawn a fresh worker per file -> fresh Node cache ->
// RN reloads -> both leakage classes should come back clean (at a speed cost).
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  resolve: { dedupe: ["react", "react-test-renderer", "react-is"] },
  test: {
    globals: true,
    environment: "node",
    include: ["leak/*.test.tsx"],
    isolate: true,
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    sequence: { shuffle: false },
    fileParallelism: false,
  },
});
