// The app runs a sibling workspace library's setup file and points the library at its source.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));
const kit = path.join(here, "packages/kit");

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  resolve: {
    alias: [
      { find: /^@m\/kit$/, replacement: path.join(kit, "src/index.ts") },
      { find: /^@m\/kit\/(.*)$/, replacement: path.join(kit, "src/$1") },
    ],
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    setupFiles: ["./packages/kit/vitest.setup.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
