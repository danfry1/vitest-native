// Idiomatic vitest-native consumer config — NO jest-compat, NO resident
// monkeypatching. Represents an app that starts fresh with vitest-native.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ engine: "native" })],
  test: {
    globals: true,
    environment: "node",
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    sequence: { shuffle: false },
    include: [path.resolve(here, "*.test.tsx")],
  },
});
