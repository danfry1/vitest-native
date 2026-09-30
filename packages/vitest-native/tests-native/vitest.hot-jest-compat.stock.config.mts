import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Files run in name order. Vitest's default sequencer orders by cached duration and
// size, which let a mock from whichever file ran last go unobserved; 04 mocks nothing
// and checks every surface, so it has to run after the others.
class ByName extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false }), jestMockTransform()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
    include: ["tests-native/hot-jest-compat/*.test.tsx"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    sequence: { shuffle: false, sequencer: ByName },
  },
});
