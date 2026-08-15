import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ engine: "native", platform: "android" })],
  test: {
    environment: "node",
    // The hot-* files assert hot-runtime invariants (generation stamps) that do
    // not hold — by design — outside the hot runtime. They run via test:hot.
    include: ["src/**/*.test.tsx"],
    exclude: ["src/hot-*.test.tsx"],
  },
});
