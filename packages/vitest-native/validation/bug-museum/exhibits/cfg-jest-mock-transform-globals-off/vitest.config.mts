// jest-compat with Vitest's default globals: false.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

export default defineConfig({
  plugins: [jestMockTransform(), reactNative({ hotRuntime: false })],
  resolve: {
    alias: Object.entries(jestCompatAliases()).map(([find, replacement]) => ({ find, replacement })),
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    setupFiles: [jestCompatSetup],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
