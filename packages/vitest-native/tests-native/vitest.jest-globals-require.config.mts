// require('@jest/globals') under jest-compat, set up as `vitest-native migrate` writes a
// config, under each engine (`--mode native` or `--mode mock`).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestCompatAliases, jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  if (mode !== "native" && mode !== "mock") {
    throw new Error(`run with --mode native or --mode mock (got '${mode}')`);
  }
  return {
    plugins: [reactNative({ engine: mode, hotRuntime: false }), jestMockTransform()],
    resolve: { alias: { ...jestCompatAliases() } },
    test: {
      globals: true,
      environment: "node",
      setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
      include: ["tests-native/jest-globals-require/*.test.js"],
    },
  };
});
