// RNTL's async helpers under Vitest's fake timers, without jest-compat (see
// rntl-timers/01-fake-timers.test.tsx). `--mode hot` runs the files in one reused hot
// worker, where RNTL stays loaded across files; `--mode stock` runs them with per-file
// isolation. Both run in name order, so a later file follows one that loaded RNTL.
// `--mode setup-hot` and `--mode setup-stock` run rntl-timers-setup/, whose setup file
// turns fake timers on before RNTL loads.
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

const MODES = ["stock", "hot", "setup-stock", "setup-hot"];

export default defineConfig(({ mode }) => {
  if (!MODES.includes(mode)) {
    throw new Error(`run with --mode ${MODES.join(" | ")} (got '${mode}')`);
  }
  const hot = mode.endsWith("hot");
  const dir = mode.startsWith("setup-") ? "rntl-timers-setup" : "rntl-timers";
  return {
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: hot ? { allowUnboundedMemory: true } : false,
      }),
    ],
    test: {
      environment: "node",
      // Vitest's globals give RNTL its auto-cleanup; they do not include `jest`.
      globals: true,
      include: [`tests-native/${dir}/*.test.tsx`],
      setupFiles:
        dir === "rntl-timers-setup" ? ["tests-native/rntl-timers-setup/setup-fake-timers.ts"] : [],
      // A helper that never resolves fails here rather than hanging the run.
      testTimeout: 10_000,
      hookTimeout: 10_000,
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      sequence: { shuffle: false, sequencer: ByName },
    },
  };
});
