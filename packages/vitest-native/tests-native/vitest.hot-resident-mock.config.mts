// A file that mocks react-native partially, then a file that presses a button, in one
// worker in name order (#670). Under hot, RNTL first loaded in the mocking file kept that
// mock as its react-native for the worker's life, and fireEvent read StyleSheet.flatten
// from it. `--mode hot` and `--mode perfile` (package.json test:native:hot:resident-mock).
import "./support/fresh-dist.mts";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "../dist/jest-compat.mjs";
import { OTHER_FIXTURES_MOCKS } from "./support/fixture-mocks.mts";

class ByName extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => (a.moduleId < b.moduleId ? -1 : 1));
  }
}

export default defineConfig(({ mode }) => {
  if (mode !== "hot" && mode !== "perfile") {
    throw new Error(`run with --mode hot or --mode perfile (got '${mode}')`);
  }
  return {
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
      }),
      jestMockTransform(OTHER_FIXTURES_MOCKS),
    ],
    resolve: { alias: jestCompatAliases() },
    test: {
      globals: true,
      environment: "node",
      include: ["tests-native/hot-resident-mock/*.test.{ts,tsx}"],
      setupFiles: [jestCompatSetup],
      maxWorkers: 1,
      fileParallelism: false,
      sequence: { sequencer: ByName },
    },
  };
});
