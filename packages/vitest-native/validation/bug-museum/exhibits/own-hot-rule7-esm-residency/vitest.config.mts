// The hot runtime, both files in ONE worker, a before b (by-name sequencer). The app points
// its workspace libraries at their source, as own-require-first does.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { BaseSequencer, type TestSpecification } from "vitest/node";

const here = path.dirname(fileURLToPath(import.meta.url));
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
  resolve: {
    alias: {
      "@m/feature": path.join(here, "packages/feature/src"),
      "@m/validator": path.join(here, "packages/validator/src"),
    },
  },
  test: {
    include: ["*.test.{ts,tsx}"],
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { sequencer: ByName, shuffle: false },
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
