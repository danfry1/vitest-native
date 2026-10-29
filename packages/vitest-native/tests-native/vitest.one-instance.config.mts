// Project-module sharing with nothing but the native engine: no jest-compat setup, no
// library Jest setup files, so the sharing it checks is the engine's own. Run per
// runtime: `--mode stock` and `--mode hot`.
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig(({ mode }) => ({
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
    }),
  ],
  test: {
    environment: "node",
    include: ["tests-native/one-instance/*.test.ts"],
  },
}));
