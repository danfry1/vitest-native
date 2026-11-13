/**
 * Test files that run an app as its own Vitest run (support/run-app.ts), with the app's
 * own config. The config running the test file does not reach that run (run-app drops
 * the VITEST* environment), so another config running the file repeats the same runs.
 * Each takes minutes on Windows CI. They run in test:native:main only, and the other
 * configs that include tests-native/*.test.ts exclude them.
 */
export const SPAWNS_OWN_RUN = [
  "tests-native/hot-fresh-preset-react.test.ts",
  "tests-native/hot-preset-esm-generation.test.ts",
];
