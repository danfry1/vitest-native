// A regex `resolve.alias`, the shape Jest's `moduleNameMapper` migrates to. Its own
// config: any alias Node cannot be given turns every missing bare specifier's
// jest.requireActual error into REQUIRE_ACTUAL_ALIAS_UNSUPPORTED (node-registry.mjs),
// which the shared suite asserts against (jest-registry-require-mock.test.ts).
// `--mode ownership` runs the same files with experimental.ownershipModel, plus the
// requireActual that only the flag's single alias record can answer.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";
import { OTHER_FIXTURES_MOCKS } from "./support/fixture-mocks.mts";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [
    reactNative({
      ownership: "error",
      engine: "native",
      hotRuntime: false,
      ...(mode === "ownership" ? { experimental: { ownershipModel: "resolver" as const } } : {}),
    }),
    jestMockTransform(OTHER_FIXTURES_MOCKS),
  ],
  resolve: {
    alias: [
      {
        find: /^@partial-mock\/(.*)$/,
        replacement: `${path.resolve(here, "fixtures/partial-mock")}/$1`,
      },
      // A string alias, the shape tsconfig `paths` migrate to (partial-mock-string.test.ts).
      { find: "@partial-mock-string", replacement: path.resolve(here, "fixtures/partial-mock") },
    ],
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
    // Relative: an absolute include is a glob that matches nothing on Windows (see
    // vitest.advice.config.mts).
    include: ["tests-native/regex-alias/*.test.ts"],
    exclude: mode === "ownership" ? [] : ["tests-native/regex-alias/*.ownership.test.ts"],
  },
}));
