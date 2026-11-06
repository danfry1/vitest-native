// Two inline `extends: true` projects inheriting one plugin from this config. Vitest 5
// once dropped a plugin's test config for that shape (#246); both projects must still
// get a context.
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";

const include = ["tests-native/shared-root/*.test.ts"];

export default defineConfig({
  plugins: [reactNative({ ownership: "error", engine: "native", platform: "android", hotRuntime: false })],
  test: {
    environment: "node",
    projects: ["a", "b"].map((name) => ({
      extends: true as const,
      test: { name, include, env: { VN_EXPECTED_PLATFORM: "android" } },
    })),
  },
});
