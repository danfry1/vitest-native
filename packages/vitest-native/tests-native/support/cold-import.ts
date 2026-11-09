/**
 * The budget for first-time work a test file does before its tests: a cold import that
 * compiles a module graph, or a first compile that loads the toolchain. On a Windows
 * runner that work alone has taken 5 s, which is the whole default test timeout, so it
 * runs in a beforeAll with this budget and the tests' own timeouts measure only the tests.
 *
 * scripts/ci/timeout-margin-reporter.mjs names any test that still uses more than 60% of
 * its timeout on CI.
 */
export const COLD_IMPORT_BUDGET_MS = 60_000;
