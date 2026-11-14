// jest-compat, as a migrated Jest suite uses it.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

export default defineConfig({
  plugins: [jestMockTransform(), reactNative({ hotRuntime: false })],
  resolve: {
    alias: Object.entries(jestCompatAliases()).map(([find, replacement]) => ({ find, replacement })),
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    globals: true,
    setupFiles: [jestCompatSetup],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
