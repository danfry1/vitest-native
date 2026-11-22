// Reanimated's shared values under the native engine (reanimated-shapes/), with
// jest-compat (`--mode compat`) and without it (`--mode plain`): the corrections apply
// to Reanimated's own mock either way.
import "./support/fresh-dist.mts";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "../dist/jest-compat.mjs";
import { OTHER_FIXTURES_MOCKS } from "./support/fixture-mocks.mts";

export default defineConfig(({ mode }) => {
  if (mode !== "plain" && mode !== "compat") {
    throw new Error(`run with --mode plain or --mode compat (got '${mode}')`);
  }
  const compat = mode === "compat";
  return {
    plugins: [
      reactNative({ engine: "native", hotRuntime: false }),
      ...(compat ? [jestMockTransform(OTHER_FIXTURES_MOCKS)] : []),
    ],
    resolve: compat ? { alias: { ...jestCompatAliases() } } : {},
    test: {
      environment: "node",
      globals: compat,
      setupFiles: compat ? [jestCompatSetup] : [],
      include: ["tests-native/reanimated-shapes/*.test.tsx"],
    },
  };
});
