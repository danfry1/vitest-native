// A React Native app on the native engine, with the precompiled registry (the default).
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  // The exhibit is about the registry, so a cold workspace builds it first.
  plugins: [reactNative({ hotRuntime: false, registryBuild: "wait" })],
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
