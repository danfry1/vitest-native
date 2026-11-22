// The jest-compat layer with no engine: its transform plugin and its setup file, and no
// reactNative(). Nothing compiles React Native's Flow source here, so the setup must not
// load React Native.
import "./support/fresh-dist.mts";
import { defineConfig } from "vitest/config";
import { jestCompatSetup, jestMockTransform } from "../dist/jest-compat.mjs";

export default defineConfig({
  plugins: [jestMockTransform({ rootMocks: false })],
  test: {
    globals: true,
    environment: "node",
    setupFiles: [jestCompatSetup],
    include: ["tests-native/jest-compat-no-engine/*.test.ts"],
  },
});
