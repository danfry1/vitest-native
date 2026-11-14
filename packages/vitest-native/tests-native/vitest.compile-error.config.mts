// A module that does not compile fails its file naming the file, line and column
// (scripts/test-compile-error-location.mjs). `--mode`: native, hot or mock.
import "./support/fresh-dist.mts";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig(({ mode }) => {
  if (mode !== "native" && mode !== "hot" && mode !== "mock") {
    throw new Error(`run with --mode native, hot or mock (got '${mode}')`);
  }
  return {
    plugins: [
      reactNative({ engine: mode === "mock" ? "mock" : "native", hotRuntime: mode === "hot" }),
    ],
    test: {
      environment: "node",
      globals: true,
      include: ["tests-native/compile-error/*.test.js"],
    },
  };
});
