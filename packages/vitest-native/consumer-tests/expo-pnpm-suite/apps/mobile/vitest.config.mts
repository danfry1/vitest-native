import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

// An Expo SDK 58 app's unit suite, without jest-compat. scripts/test-consumers.mjs runs
// it with VN_HOT unset (per-file isolation) and VN_HOT=auto (the hot runtime where the
// selector admits it), and VN_PLATFORM=android for the Android leg.
export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      platform: process.env.VN_PLATFORM === "android" ? "android" : "ios",
      hotRuntime: process.env.VN_HOT === "auto" ? "auto" : false,
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/setup/msw.ts"],
  },
});
