// A project mock that spreads the real library (jest.requireActual) under jest-compat.
// VN_HOT=true runs the same suite on the hot runtime.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: process.env.VN_HOT === "true" }), jestMockTransform()],
  resolve: { alias: { ...jestCompatAliases() } },
  test: {
    include: ["card.test.tsx"],
    globals: true,
    setupFiles: [jestCompatSetup, "./actual-mock.ts"],
  },
});
