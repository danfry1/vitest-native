import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

// The configuration the docs give a new project: nothing but the plugin.
export default defineConfig({
  plugins: [reactNative()],
  test: { include: ["src/**/*.test.tsx"] },
});
