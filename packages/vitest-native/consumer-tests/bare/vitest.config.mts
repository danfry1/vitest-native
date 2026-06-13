import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

export default defineConfig({
  plugins: [jestMockTransform(), reactNative({ engine: "native" })],
  resolve: {
    alias: jestCompatAliases(),
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: [jestCompatSetup],
  },
});
