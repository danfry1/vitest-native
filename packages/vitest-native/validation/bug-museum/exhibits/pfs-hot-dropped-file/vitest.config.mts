// The hot runtime with jest-compat. Both files run in ONE hot worker, a before b (by-name sequencer).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";

const here = path.dirname(fileURLToPath(import.meta.url));
void here;
class ByName extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    return [...files].sort((x, y) => x.moduleId.localeCompare(y.moduleId));
  }
  async shard(files: TestSpecification[]) {
    return files;
  }
}

export default defineConfig({
  plugins: [jestMockTransform(), reactNative({ hotRuntime: { allowUnboundedMemory: true } })],
  resolve: {
    alias: Object.entries(jestCompatAliases()).map(([find, replacement]) => ({ find, replacement })),
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    globals: true,
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { sequencer: ByName, shuffle: false },
    setupFiles: [jestCompatSetup],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
