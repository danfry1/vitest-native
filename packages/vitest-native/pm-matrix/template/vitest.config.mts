import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  test: { globals: true, environment: "node", include: ["*.test.tsx"] },
});
