import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

// The configuration `vitest-native migrate` generates for a jest-expo project.
export default defineConfig({
  plugins: [reactNative(), jestMockTransform()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: [jestCompatSetup],
    include: ["parity/**/*.test.tsx"],
  },
});
