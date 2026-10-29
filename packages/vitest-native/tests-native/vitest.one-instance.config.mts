// Project-module sharing with nothing but the native engine: no jest-compat setup, no
// library Jest setup files, so the sharing it checks is the engine's own. Run per
// runtime: `--mode stock` and `--mode hot`. `--mode early` adds a preset that creates the
// registry before the setup installs the sharing.
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig(({ mode }) => ({
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
      ...(mode === "early"
        ? { presets: { "./tests-native/one-instance-early/early-registry-preset.ts": true } }
        : {}),
    }),
  ],
  test: {
    environment: "node",
    include: ["tests-native/one-instance/*.test.ts"],
    // Hot: every file on one worker, in order, so hot-1..3 share it.
    ...(mode === "hot"
      ? { maxWorkers: 1, minWorkers: 1, fileParallelism: false, sequence: { shuffle: false } }
      : {}),
  },
}));
