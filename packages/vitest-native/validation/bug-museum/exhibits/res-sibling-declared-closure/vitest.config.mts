// The default native engine. The package under test declares museum-image (expo-image's
// shape); only its sibling, packages/app, declares museum-expo (expo's shape).
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
