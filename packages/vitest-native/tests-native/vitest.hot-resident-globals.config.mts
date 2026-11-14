// Two files on ONE hot worker: the globals vitest-native's resident modules create
// during the first file survive the reset before the second (#792).
// package.json test:native:hot:resident-globals.
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: { allowUnboundedMemory: true } })],
  test: {
    globals: true,
    environment: "node",
    include: ["tests-native/hot-resident-globals/*.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
