// Native engine on RNTL 13.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

export default defineConfig({
  plugins: [reactNative({ hotRuntime: false })],
  test: {
    include: ["*.test.{ts,tsx}"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
