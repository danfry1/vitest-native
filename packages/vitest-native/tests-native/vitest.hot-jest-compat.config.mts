// Cross-file isolation of the jest-compat surface (see hot-jest-compat/surfaces.ts).
// `--mode hot` runs the files in one reused hot worker; `--mode stock` runs the same
// files with per-file isolation as the control. Both run in name order: Vitest's
// default sequencer orders by cached duration, which let a mock from whichever file
// ran last go unobserved, and 04 — which mocks nothing and checks every surface — has
// to run after the others.
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
  if (mode !== "hot" && mode !== "stock") {
    throw new Error(`run with --mode hot or --mode stock (got '${mode}')`);
  }
  return {
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
      }),
      jestMockTransform(),
    ],
    test: {
      environment: "node",
      env: { VN_HOT_JEST_COMPAT_MODE: mode },
      globals: true,
      setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
      include: ["tests-native/hot-jest-compat/*.test.tsx"],
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      sequence: { shuffle: false, sequencer: ByName },
    },
  };
});
