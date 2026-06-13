import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: {
        preserveGlobals: ["__VN_EXPLICIT_RESIDENT_GLOBAL__"],
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["tests-native/hot-isolation/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    sequence: {
      shuffle: false,
    },
  },
});
