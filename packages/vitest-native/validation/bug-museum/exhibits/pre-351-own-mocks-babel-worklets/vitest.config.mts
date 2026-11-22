// The reporter's config before any change: their own Gesture Handler and Reanimated
// mocks, the gestureHandler preset off, jest-compat, and a Babel config with the
// worklets plugin (#351).
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false, presets: { gestureHandler: false } }), jestMockTransform()],
  resolve: { alias: { ...jestCompatAliases() } },
  test: {
    include: ["*.test.{ts,tsx}"],
    globals: true,
    setupFiles: [jestCompatSetup, "./gh-mocks.ts", "./reanimated-mock.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
