// A monorepo app with its own copy of React (app/node_modules/react, beside the root's that
// React Native resolves) dedupes React with an alias, as a Jest moduleNameMapper does. The
// precompiled registry (the default) is on.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  resolve: {
    alias: { react: path.join(here, "app/node_modules/react") },
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
