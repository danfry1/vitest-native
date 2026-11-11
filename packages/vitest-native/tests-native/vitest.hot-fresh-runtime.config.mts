// hotRuntime.freshRuntime: React, the renderer, scheduler and RNTL re-run per hot file. One
// worker runs both files in name order, so the second compares itself with the first
// (package.json test:native:hot:fresh-runtime).
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";

class ByName extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => (a.moduleId < b.moduleId ? -1 : 1));
  }
}

export default defineConfig({
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: { allowUnboundedMemory: true, freshRuntime: process.env.VN_FRESH !== "0" },
    }),
  ],
  test: {
    environment: "node",
    include: ["tests-native/hot-fresh-runtime/*.test.tsx"],
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { sequencer: ByName },
  },
});
