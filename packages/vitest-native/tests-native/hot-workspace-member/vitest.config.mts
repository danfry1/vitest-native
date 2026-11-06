// A workspace with a React Native library (packages/feature) that Node loads, under the
// hot runtime, every file in ONE worker in name order. Run through
// scripts/test-hot-workspace-member.mjs, which links the workspace packages into
// node_modules first, as an install would, and reads the load counts.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import { reactNative } from "../../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

class ByName extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) =>
      a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0,
    );
  }
}

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: { allowUnboundedMemory: true } })],
  resolve: {
    // The app points its workspace libraries at their source.
    alias: {
      "@m/feature": path.join(here, "packages/feature/src"),
      "@m/validator": path.join(here, "packages/validator/src"),
    },
  },
  test: {
    environment: "node",
    include: ["*.test.ts"],
    setupFiles: ["./load-count.setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    sequence: { shuffle: false, sequencer: ByName },
  },
});
