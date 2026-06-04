import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
export default defineConfig({
  plugins: [reactNative({ engine: "mock" })],
  resolve: { dedupe: ["react", "react-test-renderer", "react-is"] },
  test: { globals: true, environment: "node", include: ["shared/*.test.tsx"] },
});
