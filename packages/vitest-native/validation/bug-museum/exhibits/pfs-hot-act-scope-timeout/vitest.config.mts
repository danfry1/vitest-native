// The hot runtime on two workers. a-timeout.test.tsx runs first (by-name sequencer); the
// render files share the two workers, so some run after it on the same one.
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
    include: ["*.test.{ts,tsx}"],
    globals: true,
    maxWorkers: 2,
    sequence: { sequencer: ByName, shuffle: false },
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
