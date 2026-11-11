// hotRuntime.freshRuntime frees each file's React: 24 files in one worker, then a forced
// collection in the last (package.json test:native:hot:fresh-runtime). `--mode fresh` runs
// it with the option, `--mode resident` without, where every file shares one React.
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";

class ByName extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => (a.moduleId < b.moduleId ? -1 : 1));
  }
}

export default defineConfig(({ mode }) => {
  if (mode !== "fresh" && mode !== "resident") {
    throw new Error(`run with --mode fresh or --mode resident (got '${mode}')`);
  }
  return {
    plugins: [
      reactNative({
        engine: "native",
        // No presets: a preset whose module holds React per worker makes freshRuntime
        // decline (#719), and these gates are about freshRuntime itself.
        presets: [],
        hotRuntime: { allowUnboundedMemory: true, freshRuntime: mode === "fresh" },
      }),
    ],
    test: {
      environment: "node",
      include: ["tests-native/hot-fresh-runtime-memory/*.test.tsx"],
      maxWorkers: 1,
      fileParallelism: false,
      sequence: { sequencer: ByName },
      env: { VN_FRESH: mode === "fresh" ? "1" : "0" },
    },
  };
});
