import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ engine: "native", platform: "android" })],
  test: {
    environment: "node",
  },
});
