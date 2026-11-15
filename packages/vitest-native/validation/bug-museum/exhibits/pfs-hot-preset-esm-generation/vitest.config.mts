// The hot runtime, React resident (no freshRuntime). The three files run in ONE hot worker,
// a, b then c (by-name sequencer).
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { BaseSequencer, type TestSpecification } from "vitest/node";

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
