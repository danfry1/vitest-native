// The default native engine. The package under test declares only the workspace library
// museum-ui, which declares museum-image (expo-image's shape); a sibling, packages/app,
// declares museum-expo (expo's shape).
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
