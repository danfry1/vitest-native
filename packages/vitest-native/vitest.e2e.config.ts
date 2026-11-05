import { defineConfig } from "vitest/config";

/**
 * `vitest-native compare`'s end-to-end tests (tests/*.e2e.test.ts), run by
 * `test:cli-compare-e2e`. Each runs Vitest for real on a scratch project, which takes
 * seconds per test and longer on Windows; inside the unit suite they starved its fast
 * tests of CPU on CI runners. They need neither the plugin nor React Native's registry,
 * only the per-run temporary root.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.e2e.test.ts"],
    globalSetup: ["./tests/support/temp-root.global.ts"],
  },
});
