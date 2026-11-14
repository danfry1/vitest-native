// Five files that define one non-configurable global on first load, on ONE hot worker
// (#773). The reset before the second file could not delete it and failed every later
// file. package.json test:native:hot:nonconfigurable-global.
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: { allowUnboundedMemory: true } })],
  test: {
    globals: true,
    environment: "node",
    include: ["tests-native/hot-nonconfigurable-global/*.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
