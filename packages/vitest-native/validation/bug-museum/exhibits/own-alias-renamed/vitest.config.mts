// The app points a workspace library at its source under an alias that is not the package's name.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  resolve: {
    alias: {
      "@feat": path.join(here, "packages/feature/src"),
      "@m/validator": path.join(here, "packages/validator/src"),
    },
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
