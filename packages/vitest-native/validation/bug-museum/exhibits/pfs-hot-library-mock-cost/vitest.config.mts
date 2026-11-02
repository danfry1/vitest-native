// The hot runtime, one worker, with a counting preload.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";
import { BaseSequencer, type TestSpecification } from "vitest/node";

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
  plugins: [reactNative({ hotRuntime: { allowUnboundedMemory: true } })],
  test: {
    include: ["*.test.{ts,tsx}"],
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { sequencer: ByName, shuffle: false },
    setupFiles: ["./setup.ts"],
    execArgv: ["--import", path.join(here, "counter.mjs")],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
