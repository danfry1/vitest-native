// Coverage of a project whose tests run part of its own source in Node: see
// scripts/test-coverage-native.mjs, which links the workspace package and the
// node_modules package in, runs this config in each mode and reads the report.
//
//   VN_COVERAGE_MODE=default  @cov/rnlib is linked: Node compiles it.
//   VN_COVERAGE_MODE=hot      The same, under the hot runtime, both files in one worker.
//   VN_COVERAGE_MODE=vite     Nothing linked; @cov/rnlib is aliased to its source, so
//                             Vite loads it. The reference the Node modes must match.
import "../support/fresh-dist.mts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../../dist/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const mode = process.env.VN_COVERAGE_MODE ?? "default";
const hot = mode === "hot";

export default defineConfig({
  resolve:
    mode === "vite"
      ? { alias: { "@cov/rnlib": path.join(here, "packages/rnlib/src/index.ts") } }
      : undefined,
  plugins: [
    reactNative({
      engine: "native",
      hotRuntime: hot ? { allowUnboundedMemory: true } : false,
    }),
  ],
  test: {
    environment: "node",
    include: ["*.test.tsx"],
    ...(hot ? { maxWorkers: 1, fileParallelism: false } : {}),
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**", "packages/*/src/**"],
      reporter: ["json"],
      reportsDirectory: process.env.VN_COVERAGE_DIR ?? "coverage",
    },
  },
});
