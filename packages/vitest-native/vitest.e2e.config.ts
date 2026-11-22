import { defineConfig } from "vitest/config";

/**
 * The end-to-end tests (tests/*.e2e.test.ts), run by `test:e2e`: every test file that runs
 * Vitest itself on a scratch project (compare, migrate's generated config, the ownership
 * guard's fixture apps, the hang guard). Each takes seconds per test and longer on Windows.
 * Inside the unit suite they starved its fast tests of CPU on CI runners until those timed
 * out, so they run here, after it (tests/e2e-placement.test.ts keeps them here). They need
 * neither the plugin nor React Native's registry, only the per-run temporary root.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.e2e.test.ts"],
    globalSetup: ["./tests/support/temp-root.global.ts"],
  },
});
