import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [
    reactNative({ engine: "native", hotRuntime: process.env.VN_HOT === "auto" ? "auto" : false }),
  ],
  test: { environment: "node", include: ["src/**/*.test.tsx"] },
});
