// Every scheduled file must produce a result (scripts/test-hot-file-accounting.mjs).
// `--mode regression` is a pair the hot runtime once dropped the second of, silently;
// `--mode guard` breaks a task on purpose, so its other file must still be reported.
// One worker and name order: the files share one task, the shape that loses them.
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

export default defineConfig(({ mode }) => {
  if (mode !== "regression" && mode !== "guard") {
    throw new Error(`run with --mode regression or --mode guard (got '${mode}')`);
  }
  return {
    plugins: [
      reactNative({ engine: "native", hotRuntime: { allowUnboundedMemory: true } }),
      jestMockTransform(),
    ],
    test: {
      environment: "node",
      setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
      include: [`tests-native/hot-file-accounting/${mode}/*.test.ts`],
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      sequence: { shuffle: false, sequencer: ByName },
    },
  };
});
