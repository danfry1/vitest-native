// The coverage options live in the root config and vitest-native only in a project's
// config (packages/app), as in a monorepo. scripts/test-coverage-native.mjs links `lib`
// into the app's node_modules, so Node owns it, and runs this config.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/app"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      reporter: ["json"],
      reportsDirectory: process.env.VN_COVERAGE_DIR ?? "coverage",
    },
  },
});
