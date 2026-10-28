// The native engine with Vitest's default `test.globals: false`, which every other
// native config turns on (as `init` and `migrate` write it). React Native Testing
// Library registers its auto-cleanup only through a global `afterEach`, so this is the
// configuration where the setup file must register it instead (rntl-support.mjs).
// `--mode native` runs the files with per-file isolation; `--mode hot` runs them in one
// reused hot worker, and `--mode noiso` (native) and `--mode mock-noiso` (mock engine)
// in one worker with `isolate: false`, all in name order, so the `/pure` file follows a
// file that imported RNTL's entry into that worker's module cache.
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
  const modes = ["native", "hot", "noiso", "mock-noiso"];
  if (!modes.includes(mode)) {
    throw new Error(`run with --mode ${modes.join(", ")} (got '${mode}')`);
  }
  return {
    plugins: [
      reactNative({
        engine: mode === "mock-noiso" ? "mock" : "native",
        hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
      }),
    ],
    test: {
      environment: "node",
      env: { VN_NO_GLOBALS_MODE: mode },
      ...(mode.endsWith("noiso") ? { isolate: false } : {}),
      include: ["tests-native/no-globals/*.test.tsx"],
      // The shared test-utils fixture goes to Node, as an installed package would, so
      // RNTL is reached through a module Vite does not evaluate (05, 06).
      server: { deps: { external: [/fixtures[\\/]rntl-reexport[\\/]/] } },
      // A cleanup that waits on a faked timer would otherwise hang for the default 10s.
      hookTimeout: 5000,
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      sequence: { shuffle: false, sequencer: ByName },
    },
  };
});
