// The app runs a sibling workspace library's setup file and points the library at its source.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  resolve: {
    alias: {
      "@m/kit": path.join(here, "packages/kit/src/index.ts"),
    },
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    setupFiles: [path.join(here, "packages/kit/vitest.setup.ts")],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
