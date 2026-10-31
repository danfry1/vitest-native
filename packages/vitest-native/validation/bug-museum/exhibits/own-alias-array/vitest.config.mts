// The app points its workspace libraries at their source: string aliases in array form ([{ find, replacement }]).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  resolve: {
    alias: [
      { find: "@m/feature", replacement: path.join(here, "packages/feature/src") },
      { find: "@m/validator", replacement: path.join(here, "packages/validator/src") },
    ],
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
