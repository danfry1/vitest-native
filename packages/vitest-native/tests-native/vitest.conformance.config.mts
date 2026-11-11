// The mock conformance probes (conformance/): each served module against its installed
// package's declared API. Under the native engine with jest-compat (`--mode compat`) and
// without (`--mode plain`); under the mock engine, whose presets stand in for the
// libraries (`--mode mock`), as its own job so a failure says which engine it is.
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "../dist/jest-compat.mjs";
import { OTHER_FIXTURES_MOCKS } from "./support/fixture-mocks.mts";

export default defineConfig(({ mode }) => {
  if (mode !== "plain" && mode !== "compat" && mode !== "mock") {
    throw new Error(`run with --mode plain, compat or mock (got '${mode}')`);
  }
  const compat = mode === "compat";
  return {
    plugins: [
      reactNative({ engine: mode === "mock" ? "mock" : "native", hotRuntime: false }),
      ...(compat ? [jestMockTransform(OTHER_FIXTURES_MOCKS)] : []),
    ],
    resolve: compat ? { alias: { ...jestCompatAliases() } } : {},
    test: {
      environment: "node",
      globals: compat,
      setupFiles: compat ? [jestCompatSetup] : [],
      include: ["tests-native/conformance/*.test.tsx"],
      // Which waivers apply: the mock engine's presets differ from the libraries as such.
      env: { VN_CONFORMANCE_ENGINE: mode === "mock" ? "mock" : "native" },
      testTimeout: 20_000,
    },
  };
});
