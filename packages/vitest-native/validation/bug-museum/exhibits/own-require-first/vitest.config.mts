// The app points its workspace libraries at their source: one string alias per package
// (object form), as own-alias-string does. Only the order of the test's imports differs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

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
