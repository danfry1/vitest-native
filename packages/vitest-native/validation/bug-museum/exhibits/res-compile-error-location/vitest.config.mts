// The native engine, plain: no project Babel config compiles the decorator.
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  test: {
    include: ["*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
