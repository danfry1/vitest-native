// One hot worker, files in name order (tests-native/hot-compiled-mjs-require.test.ts
// edits freshRuntime in).
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "vitest-native";

class ByName extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    return [...files].sort((x, y) => x.moduleId.localeCompare(y.moduleId));
  }
  async shard(files: TestSpecification[]) {
    return files;
  }
}

export default defineConfig({
  plugins: [reactNative({ hotRuntime: { allowUnboundedMemory: true } })],
  test: {
    include: ["*.test.ts"],
    globals: true,
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { sequencer: ByName, shuffle: false },
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
