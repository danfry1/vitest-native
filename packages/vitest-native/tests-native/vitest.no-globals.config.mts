// The native engine with Vitest's default `test.globals: false`, which every other
// native config turns on (as `init` and `migrate` write it). React Native Testing
// Library registers its auto-cleanup only through a global `afterEach`, so this is the
// configuration where the setup file must register it instead (rntl-support.mjs).
// `--mode native` runs the files with per-file isolation; `--mode hot` runs them in one
// reused hot worker, in name order, so the `/pure` file follows a file that imported
// RNTL's entry into that worker's module cache.
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
  if (mode !== "native" && mode !== "hot") {
    throw new Error(`run with --mode native or hot (got '${mode}')`);
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
      env: { VN_NO_GLOBALS_MODE: mode },
      include: ["tests-native/no-globals/*.test.tsx"],
      // A cleanup that waits on a faked timer would otherwise hang for the default 10s.
      hookTimeout: 5000,
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      sequence: { shuffle: false, sequencer: ByName },
    },
  };
});
