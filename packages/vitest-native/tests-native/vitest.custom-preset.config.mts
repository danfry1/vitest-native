// A preset module of the project's own (presets: { './path': true }), under the engine and
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
        // The object form keeps auto-detection and adds the module.
        presets: { "./tests-native/custom-preset/zz-lib-preset.ts": true },
      }),
    ],
    test: {
      environment: "node",
      setupFiles: ["./tests-native/custom-preset/readiness.setup.ts"],
      include: ["tests-native/custom-preset/*.test.tsx"],
    },
  };
});
