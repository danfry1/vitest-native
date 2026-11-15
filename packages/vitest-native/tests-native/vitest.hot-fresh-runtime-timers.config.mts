// RNTL reinstalls fake timers in every file under hotRuntime.freshRuntime, as under
// per-file isolation (package.json test:native:hot:fresh-runtime). `--mode fresh` and
// `--mode perfile` pass; `--mode resident` fails from the second file on.
import "./support/fresh-dist.mts";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";
class ByName extends BaseSequencer {
  override async sort(f: TestSpecification[]) {
    return [...f].sort((a, b) => (a.moduleId < b.moduleId ? -1 : 1));
  }
}
export default defineConfig(({ mode }) => ({
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime:
        mode === "perfile" ? false : { allowUnboundedMemory: true, freshRuntime: mode === "fresh" },
    }),
  ],
  test: {
    environment: "node",
    include: ["tests-native/hot-fresh-runtime-timers/*.test.tsx"],
    setupFiles: ["tests-native/hot-fresh-runtime-timers/setup.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { sequencer: ByName },
  },
}));
