// The hot runtime with an explicit worker count.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

export default defineConfig({
  plugins: [reactNative({ hotRuntime: true })],
  test: {
    include: ["*.test.{ts,tsx}"],
    maxWorkers: 6,
    globalSetup: ["./global-setup.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
