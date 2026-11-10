import os from "node:os";

/**
 * The run's own temporary root (tests/support/temp-root.global.ts), which global teardown
 * removes with everything in it. Scratch trees that are slow to delete (a materialised app
 * with its node_modules, a project holding React Native registry builds) go here and are
 * not deleted per file: deleting one in an afterAll took longer than Vitest's 10 s hook
 * timeout on Windows runners, in 5 of 53 Windows native jobs in a day, after the tests
 * had passed. Global teardown has no hook timeout.
 *
 * Throws in a config without one, naming the fix, so a new config cannot bring per-file
 * cleanup back or leak into the system temp directory.
 */
export function runTempRoot(): string {
  const root = os.tmpdir();
  if (!/[\\/]vn-test-run-[^\\/]+$/.test(root)) {
    throw new Error(
      `this scratch tree belongs under the run's temporary root, which this config does not ` +
        `set (os.tmpdir() is ${root}). Add tests/support/temp-root.global.ts to its globalSetup.`,
    );
  }
  return root;
}
