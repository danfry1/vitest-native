import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

// The hot runtime from a PACKED install. In the workspace, vitest-native and the
// validation suites resolve outside node_modules, so the loader's generation stamp
// (scoped to node_modules) can never touch the engine or Vitest's own runtime there
// — the in-repo gates are structurally blind to a whole class of defect that only
// exists once everything sits under node_modules. This config is the packed twin of
// validate:hot-parity's premise: the same engine, loaded the way a consumer loads it.
export default defineConfig({
  plugins: [reactNative({ engine: "native", platform: "android", hotRuntime: true })],
  test: {
    environment: "node",
    include: ["src/hot-*.test.tsx"],
    // One worker, in order: hot-b must run AFTER hot-a in the SAME worker, or the
    // cross-file reset assertion tests nothing (two workers each see a fresh
    // instance trivially) and the generation the probe observes never advances.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
