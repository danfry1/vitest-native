// The hot runtime with Vitest's default globals: false.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

export default defineConfig({
  plugins: [reactNative({ hotRuntime: { allowUnboundedMemory: true } })],
  test: {
    include: ["*.test.{ts,tsx}"],
    maxWorkers: 1,
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
