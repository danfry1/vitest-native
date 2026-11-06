// The default native engine. The package under test declares nothing: it imports the
// workspace library packages/ui (which declares museum-image, expo-image's shape) through
// a resolve.alias. A sibling, packages/app, declares museum-expo (expo's shape).
import path from "node:path";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  resolve: { alias: { "@ui": path.resolve(import.meta.dirname, "packages/ui") } },
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
