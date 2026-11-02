// The app points its workspace libraries at their source: aliases to files (…/src/index.ts, …/store.ts).
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
      "@m/feature": path.join(here, "packages/feature/src/index.ts"),
      "@m/validator/store": path.join(here, "packages/validator/src/store.ts"),
    },
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
