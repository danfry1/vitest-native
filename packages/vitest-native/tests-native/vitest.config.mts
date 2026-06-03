import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  test: {
    globals: true,
    environment: "node",
    include: ["tests-native/*.test.tsx", "tests-native/*.test.ts"],
  },
});
