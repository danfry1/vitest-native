// experimental.nodeMocks (ADR-0007, #322): a vi.mock applies to the modules Node loads.
// Modes: stock (per-file workers), hot (the hot runtime), jest-compat (with jest-compat's
// setup and transform, whose jest.mock is matched before a vi.mock).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
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
    // Relative: an absolute include is a glob that matches nothing on Windows (see
    // vitest.advice.config.mts).
    include:
      mode === "jest-compat"
        ? ["tests-native/node-mocks/*.test.ts"]
        : ["tests-native/node-mocks/vi-*.test.ts"],
  },
}));
