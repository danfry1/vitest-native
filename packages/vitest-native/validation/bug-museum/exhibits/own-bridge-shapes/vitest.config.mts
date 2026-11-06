// The shapes the require bridge must serve, or refuse by name, when Node-owned code
// (a React Native workspace library) requires project source before the test imports
// it. The app points its workspace libraries at their source, as own-require-first does.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  resolve: {
    alias: {
      "@m/feature": path.join(here, "packages/feature/src"),
      "@m/validator": path.join(here, "packages/validator/src"),
    },
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
