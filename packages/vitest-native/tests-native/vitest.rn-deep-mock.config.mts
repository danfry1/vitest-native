// A mock of a react-native/Libraries path reaches the module `react-native` exports (#573).
// Modes: stock (per-file workers), hot (one reused hot worker, files in name order, so a
// mock that outlived its file would reach the next), node-mocks (vi.mock with
// experimental.nodeMocks).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";
import { jestCompatAliases, jestMockTransform } from "../dist/jest-compat.mjs";
import { OTHER_FIXTURES_MOCKS } from "./support/fixture-mocks.mts";

const here = path.dirname(fileURLToPath(import.meta.url));

class ByName extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) =>
      a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0,
    );
  }
}

export default defineConfig(({ mode }) => {
  if (mode !== "stock" && mode !== "hot" && mode !== "node-mocks") {
    throw new Error(`run with --mode stock, hot or node-mocks (got '${mode}')`);
  }
  if (mode === "node-mocks") {
    return {
      plugins: [reactNative({ engine: "native", experimental: { nodeMocks: true } })],
      test: { environment: "node", include: ["tests-native/rn-deep-mock/vi-mock.test.tsx"] },
    };
  }
  return {
    plugins: [
      reactNative({
        engine: "native",
        hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
      }),
      jestMockTransform(OTHER_FIXTURES_MOCKS),
    ],
    resolve: { alias: { ...jestCompatAliases() } },
    test: {
      environment: "node",
      globals: true,
      setupFiles: [
        path.resolve(here, "../dist/jest-compat/setup.mjs"),
        path.resolve(here, "rn-deep-mock/setup.js"),
      ],
      include: ["tests-native/rn-deep-mock/{a,b,c}-*.test.tsx"],
      fileParallelism: false,
      maxWorkers: 1,
      sequence: { shuffle: false, sequencer: ByName },
    },
  };
});
