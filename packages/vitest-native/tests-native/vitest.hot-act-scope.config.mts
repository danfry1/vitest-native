// A file that leaves React's act() scope open must cost only itself
// (scripts/test-hot-act-scope.mjs). `--mode <fixture>-<shape>` runs
// hot-act-scope/leaks/a-<fixture>.test.tsx, then 16 ordinary render files:
//   fixture  timeout    a test times out while awaiting act(); the scope stays open
//            late       the same, but the act() callback finishes ~0.5 s later
//            unawaited  a passing test starts an async act() it never awaits, which
//                       React never closes
//   shape    pool       two workers: every file is its own task, so a worker can retire
//            batch      one worker: Vitest runs every file as one task, so it cannot
// Files run in name order, so the leaking file `a-*` starts first.
import path from "node:path";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";

class ByName extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const name = (file: TestSpecification) => path.basename(file.moduleId);
    return [...files].sort((a, b) => (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0));
  }
}

const FIXTURES = ["timeout", "late", "unawaited"];
const SHAPES = ["pool", "batch"];

export default defineConfig(({ mode }) => {
  const [fixture, shape] = mode.split("-");
  if (!FIXTURES.includes(fixture) || !SHAPES.includes(shape)) {
    throw new Error(
      `run with --mode <${FIXTURES.join("|")}>-<${SHAPES.join("|")}> (got '${mode}')`,
    );
  }
  const batch = shape === "batch";
  return {
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: batch ? { allowUnboundedMemory: true } : true,
      }),
    ],
    test: {
      environment: "node",
      include: [
        `tests-native/hot-act-scope/leaks/a-${fixture}.test.tsx`,
        "tests-native/hot-act-scope/renders/*.test.tsx",
      ],
      maxWorkers: batch ? 1 : 2,
      fileParallelism: !batch,
      testTimeout: 2_000,
      sequence: { shuffle: false, sequencer: ByName },
    },
  };
});
