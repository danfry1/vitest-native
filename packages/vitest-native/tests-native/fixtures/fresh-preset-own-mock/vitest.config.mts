// Two files on one hot worker with freshRuntime and one preset, safe-area, serving the
// installed library's own Jest mock (5.8.1 and later ship it built): no preset module
// holds React per worker, so freshRuntime stays on (fresh-runtime-presets.ts).
import { defineConfig } from "vitest/config";
import { presets, reactNative } from "vitest-native";

export default defineConfig({
  plugins: [
    reactNative({
      presets: [presets.safeAreaContext()],
      hotRuntime: { allowUnboundedMemory: true, freshRuntime: true },
    }),
  ],
  test: {
    include: ["*.test.tsx"],
    globals: true,
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
