// Fourteen files on one hot worker with freshRuntime, two per preset: each renders
// through its preset (safe-area, navigation, reanimated, unistyles, mmkv, webview) or,
// for gesture-handler, the library run as itself with its own Jest setup.
// tests-native/hot-fresh-preset-react.test.ts edits freshRuntime off for the control.
// One worker runs every file, so each follows the ones before it.
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
