// A regex `resolve.alias`, the shape Jest's `moduleNameMapper` migrates to. Its own
// config: any alias Node cannot be given turns every missing bare specifier's
// jest.requireActual error into REQUIRE_ACTUAL_ALIAS_UNSUPPORTED (node-registry.mjs),
// which the shared suite asserts against (jest-registry-require-mock.test.ts).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: false }), jestMockTransform()],
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
  },
});
