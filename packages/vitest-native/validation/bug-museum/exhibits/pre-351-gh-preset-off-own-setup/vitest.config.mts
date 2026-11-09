// The reporter's config at the step where Gesture Handler's own mocks were removed but the
// preset stayed off, with their Reanimated mock and Babel config (#351).
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

export default defineConfig({
  plugins: [
    reactNative({ hotRuntime: false, presets: { gestureHandler: false } }),
    jestMockTransform(),
  ],
  resolve: { alias: { ...jestCompatAliases() } },
  test: {
    include: ["*.test.{ts,tsx}"],
    globals: true,
    setupFiles: ["./record-warnings.ts", jestCompatSetup, "./reanimated-mock.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
