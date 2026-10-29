// RNTL's async helpers under Vitest's fake timers, without jest-compat (see
// rntl-timers/01-fake-timers.test.tsx). `--mode hot` runs the files in one reused hot
// worker, where RNTL stays loaded across files; `--mode stock` runs them with per-file
// isolation. Both run in name order, so 03 follows a file that loaded RNTL.
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";

class ByName extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) =>
      a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0,
    );
  }
}

export default defineConfig(({ mode }) => {
  if (mode !== "hot" && mode !== "stock") {
    throw new Error(`run with --mode hot or --mode stock (got '${mode}')`);
  }
  return {
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
      }),
    ],
    test: {
      environment: "node",
      // Vitest's globals give RNTL its auto-cleanup; they do not include `jest`.
      globals: true,
      include: ["tests-native/rntl-timers/*.test.tsx"],
      // A helper that never resolves fails here rather than hanging the run.
      testTimeout: 10_000,
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      sequence: { shuffle: false, sequencer: ByName },
    },
  };
});
