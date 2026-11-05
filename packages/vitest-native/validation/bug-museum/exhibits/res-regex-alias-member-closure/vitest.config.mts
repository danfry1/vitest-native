// The default native engine. The package under test declares nothing: it imports the
// workspace library packages/ui (which declares museum-image, expo-image's shape) through
// a resolve.alias whose `find` is a RegExp. A sibling, packages/app, declares museum-expo
// (expo's shape).
import path from "node:path";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  resolve: {
    alias: [
      {
        find: /^@ui\/(.*)$/,
        replacement: `${path.resolve(import.meta.dirname, "packages/ui")}/$1`,
      },
    ],
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
