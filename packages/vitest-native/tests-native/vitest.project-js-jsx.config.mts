// JSX in a project's own .js files (setup, test and source), under the engine and
// runtime `--mode` names: `native`, `hot` (the native engine's hot runtime) or `mock`.
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

export default defineConfig(({ mode }) => {
  if (mode !== "native" && mode !== "hot" && mode !== "mock") {
    throw new Error(`run with --mode native, hot or mock (got '${mode}')`);
  }
  return {
    plugins: [
      reactNative({
        engine: mode === "mock" ? "mock" : "native",
        hotRuntime: mode === "hot",
      }),
    ],
    test: {
      environment: "node",
      setupFiles: ["./tests-native/project-js-jsx/setup.js"],
      include: ["tests-native/project-js-jsx/*.test.{js,tsx}"],
    },
  };
});
