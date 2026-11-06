// Coverage of project source Node requires before the test imports it: v8 coverage, with
// a JSON report the check reads (check.mjs).
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
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["packages/validator/src/**"],
      reporter: ["json"],
      reportsDirectory: "coverage",
    },
  },
});
