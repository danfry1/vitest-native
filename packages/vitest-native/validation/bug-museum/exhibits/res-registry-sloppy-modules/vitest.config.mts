// A React Native app on the native engine, with the precompiled registry (the default).
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

// The exhibit is about the registry, so a cold workspace waits for it to be built.
process.env.VITEST_NATIVE_REGISTRY_WAIT = "1";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
