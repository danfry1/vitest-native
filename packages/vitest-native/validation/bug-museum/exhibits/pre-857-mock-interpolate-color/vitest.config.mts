// A project with Reanimated installed, on the mock engine.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ engine: "mock" })],
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
