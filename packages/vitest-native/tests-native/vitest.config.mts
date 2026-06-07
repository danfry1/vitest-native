import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";

export default defineConfig({
  plugins: [reactNative({ engine: "native" }), jestMockTransform()],
  test: {
    globals: true,
    environment: "node",
    include: ["tests-native/*.test.tsx", "tests-native/*.test.ts"],
  },
});
