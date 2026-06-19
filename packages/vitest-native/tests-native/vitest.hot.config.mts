// The package's own native suite under the HOT RUNTIME (persistent RN-hot
// workers + per-file module-runner isolation via the custom pool). M0 smoke /
// M2 gate config — same suite as vitest.config.mts, hotRuntime flipped on.
// Run: bun vitest run --config tests-native/vitest.hot.config.mts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactNative({ engine: "native", hotRuntime: true }), jestMockTransform()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
    include: ["tests-native/*.test.tsx", "tests-native/*.test.ts"],
    // See vitest.config.mts: these two require their own dedicated config files.
    exclude: ["tests-native/android.test.ts", "tests-native/navigation-params.test.tsx"],
  },
});
