// The hot runtime with jest-compat, as Rocket.Chat runs. Both files run in ONE hot worker,
// a before b (by-name sequencer).
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";
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
  plugins: [reactNative({ hotRuntime: { allowUnboundedMemory: true } }), jestMockTransform()],
  resolve: { alias: jestCompatAliases() },
  test: {
    include: ["*.test.{ts,tsx}"],
    globals: true,
    setupFiles: [jestCompatSetup],
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { sequencer: ByName, shuffle: false },
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
