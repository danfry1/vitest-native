// jest-compat's per-file mock registry in a reused worker WITHOUT the hot runtime:
// `isolate: false`, one worker, files in name order (b1 mocks, b2 and b3 must not see
// it). The hot runtime clears the registry through its state manifest; this run has
// no hot runtime, so it proves the registry clears itself when the file changes.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

class ByName extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) =>
      a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0,
    );
  }
}

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false }), jestMockTransform()],
  test: {
    environment: "node",
    globals: true,
    isolate: false,
    setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
    include: ["tests-native/jest-registry-no-isolate/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    sequence: { shuffle: false, sequencer: ByName },
  },
});
