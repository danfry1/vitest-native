// Native engine via the plugin with NO isolate override — exercises the shipped
// DEFAULT. Single worker + fixed order = the worst case for leakage. After the
// fix (plugin no longer forces isolate:false), the default is isolate:true and
// this must come back clean.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  resolve: { dedupe: ["react", "react-test-renderer", "react-is"] },
  test: {
    globals: true,
    environment: "node",
    include: ["leak/*.test.tsx"],
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    sequence: { shuffle: false },
    fileParallelism: false,
  },
});
