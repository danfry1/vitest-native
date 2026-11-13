// The require bridge under load: sixteen test files, four workers, the hot runtime. Each
// file has Node require a 24-module slice of a generated graph before the test imports it.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ hotRuntime: true })],
  resolve: {
    alias: {
      "@m/feature": path.join(here, "packages/feature/src"),
      "@m/validator": path.join(here, "packages/validator/src"),
    },
  },
  test: {
    include: ["s*.test.ts"],
    globalSetup: ["./graph.ts"],
    maxWorkers: 4,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
