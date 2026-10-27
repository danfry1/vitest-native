// The package's own native suite under the HOT RUNTIME (persistent RN-hot
// workers + per-file module-runner isolation via the custom pool). M0 smoke /
// M2 gate config — same suite as vitest.config.mts, hotRuntime flipped on.
// Run: bun vitest run --config tests-native/vitest.hot.config.mts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";
import { NATIVE_SUITE_SETUP_FILES } from "./support/setup-files.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // The workspace installs expo-constants and expo-status-bar without expo itself, so
  // their real JavaScript cannot run here (expo-modules-core resolves to another
  // SDK's TypeScript source). The expo preset, which the native engine applies only
  // when asked (NATIVE_ENGINE_RUNS_PACKAGES), is turned on; the packed Expo consumers
  // run the real packages.
  plugins: [
    reactNative({ engine: "native", hotRuntime: true, presets: { expo: true } }),
    jestMockTransform(),
  ],
  // The tsconfig-paths-style alias requireactual-alias.test.tsx exercises.
  resolve: { alias: { "@vn-app": path.resolve(here, "fixtures/alias-app") } },
  test: {
    globals: true,
    environment: "node",
    setupFiles: NATIVE_SUITE_SETUP_FILES,
    include: ["tests-native/*.test.tsx", "tests-native/*.test.ts"],
    // See vitest.config.mts: these two require their own dedicated config files.
    exclude: ["tests-native/android.test.ts", "tests-native/navigation-params.test.tsx"],
  },
});
