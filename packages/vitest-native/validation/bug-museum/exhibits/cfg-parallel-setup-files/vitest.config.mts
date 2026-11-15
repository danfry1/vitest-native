// The app's own setup file imports react-native, and the app runs its setup files in parallel.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  test: {
    include: ["*.test.{ts,tsx}"],
    setupFiles: ["./setup.ts"],
    sequence: { setupFiles: "parallel" },
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
