// experimental.nodeMocks (docs: node-mocks-design.md): a vi.mock applies to the modules
// Node loads. Modes: stock (per-file workers); hot (the hot runtime, one worker, files in
// name order, so a mock that outlived its file would reach the next, and the zz- files
// run after the files that mock what they leave unmocked); jest-compat (with
// jest-compat's setup and transform, whose jest.mock is matched before a vi.mock).
// Rooted at node-mocks/, so the suite's own files are its project.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Files in name order, so which file runs after which in the hot worker is fixed. */
class ByName extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) =>
      a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0,
    );
  }
}

export default defineConfig(({ mode }) => ({
  root: path.join(here, "node-mocks"),
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
      experimental: { nodeMocks: true },
    }),
    ...(mode === "jest-compat" ? [jestMockTransform()] : []),
  ],
  test: {
    environment: "node",
    globals: true,
    globalSetup: [path.join(here, "node-mocks", "nested-copy.global.ts")],
    setupFiles: mode === "jest-compat" ? [path.resolve(here, "../dist/jest-compat/setup.mjs")] : [],
    include: mode === "jest-compat" ? ["*.test.ts", "jest/*.test.ts"] : ["*.test.ts"],
    ...(mode === "hot"
      ? { maxWorkers: 1, fileParallelism: false, sequence: { shuffle: false, sequencer: ByName } }
      : {}),
  },
}));
