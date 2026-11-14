// The native engine with `nativeModules: 'permissive'`, which makes every native module
// present. Runs the installed expo and expo-constants (see permissive/expo.test.ts).
// `--mode hot` runs the same files in the hot runtime.
import "./support/fresh-dist.mts";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const MODES = ["stock", "hot"];

export default defineConfig(({ mode }) => {
  if (!MODES.includes(mode)) {
    throw new Error(`run with --mode ${MODES.join(" | ")} (got '${mode}')`);
  }
  return {
    plugins: [
      reactNative({ ownership: "error",
        engine: "native",
        nativeModules: "permissive",
        hotRuntime: mode === "hot" ? { allowUnboundedMemory: true } : false,
      }),
    ],
    test: {
      environment: "node",
      include: ["tests-native/permissive/*.test.ts"],
    },
  };
});
