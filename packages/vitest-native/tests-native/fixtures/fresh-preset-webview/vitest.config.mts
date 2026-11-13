// Two files on one hot worker with freshRuntime: each renders through the webview
// preset's built-in module (tests-native/hot-fresh-preset-react.test.ts edits freshRuntime
// off for the control). One worker runs both files, so the second follows the first.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: { allowUnboundedMemory: true, freshRuntime: true } })],
  test: {
    include: ["*.test.tsx"],
    globals: true,
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
