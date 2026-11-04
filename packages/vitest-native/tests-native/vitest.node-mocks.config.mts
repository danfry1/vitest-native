// experimental.nodeMocks (docs: node-mocks-design.md): a vi.mock applies to the modules
// Node loads. Modes: stock (per-file workers); hot (the hot runtime, one worker, files in
// order, so a mock that outlived its file would reach the next); jest-compat (with
// jest-compat's setup and transform, whose jest.mock is matched before a vi.mock).
// Rooted at node-mocks/, whose __mocks__ directory is Vitest's root mocks.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

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
    setupFiles:
      mode === "jest-compat" ? [path.resolve(here, "../dist/jest-compat/setup.mjs")] : [],
    include: mode === "jest-compat" ? ["*.test.ts", "jest/*.test.ts"] : ["*.test.ts"],
    ...(mode === "hot"
      ? { maxWorkers: 1, fileParallelism: false, sequence: { shuffle: false } }
      : {}),
  },
}));
