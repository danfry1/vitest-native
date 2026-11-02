import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

// expo-router's own testing library is written for Jest, so its suite runs with the
// jest-compat layer a migrated jest-expo suite brings. VN_PLATFORM=android renders the
// same routes on Android, where the router's toolbar requires .xml vector drawables.
export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      platform: process.env.VN_PLATFORM === "android" ? "android" : "ios",
      hotRuntime: process.env.VN_HOT === "auto" ? "auto" : false,
    }),
    jestMockTransform(),
  ],
  test: {
    environment: "node",
    globals: true,
    setupFiles: [jestCompatSetup],
    include: ["router-tests/**/*.test.tsx"],
  },
});
