// A file that opts out of RNTL's auto-cleanup, a slow filler, and a file that relies on
// it, alphabetically on two hot workers, so the first and third share one (#690). The
// hot reset put back the first file's Vitest worker state, and the third file's cleanup
// read the first file's opt-out. package.json test:native:hot:worker-state.
import "./support/fresh-dist.mts";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";

class ByName extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => (a.moduleId < b.moduleId ? -1 : 1));
  }
}

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: true })],
  test: {
    // No test globals: the engine's own afterEach cleanup is the one under test.
    globals: false,
    environment: "node",
    include: ["tests-native/hot-worker-state/*.test.tsx"],
    maxWorkers: 2,
    sequence: { sequencer: ByName, shuffle: false },
  },
});
