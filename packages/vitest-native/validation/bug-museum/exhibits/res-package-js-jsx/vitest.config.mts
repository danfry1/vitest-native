// An app with zero configuration on the native engine.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  test: {
    include: ["*.test.tsx"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
