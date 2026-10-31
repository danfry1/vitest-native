// The app points its workspace libraries at their source: resolve.tsconfigPaths: true with compilerOptions.paths.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  resolve: { tsconfigPaths: true },
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
