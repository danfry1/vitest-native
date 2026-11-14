/**
 * Placing this package's setup files in a project's own `test.setupFiles`.
 *
 * A config hook cannot place a setup file by returning it: Vite merges a returned
 * `setupFiles` array AFTER the project's own (`mergeConfig` concatenates left to right),
 * so the project's setup files would run first. Vite documents mutating the user config
 * in the hook for what merging cannot express, so the list is edited in place.
 *
 * Position alone is not order, though. Under `sequence.setupFiles: 'parallel'` Vitest
 * imports every setup file at once, and a project setup file that imports `react-native`
 * reached Node before the engine's setup had installed its require hooks: "SyntaxError:
 * Unexpected token 'typeof'" from React Native's Flow source. The files placed here
 * depend on what runs before them (the engine's setup, then jest-compat's, then the
 * root mocks that call `jest.mock`), so a project that holds one runs its setup files
 * in order.
 */

interface TestConfig {
  setupFiles?: unknown;
  sequence?: { setupFiles?: unknown };
}

/**
 * Inserts `files` into `test.setupFiles` in place: at the front, or straight after the
 * last entry `after` matches. Entries already listed are moved, not repeated. Under
 * `sequence.setupFiles: 'parallel'`, the project's setup files then run in order.
 */
export function placeSetupFiles(
  test: TestConfig,
  files: readonly string[],
  after?: (entry: string) => boolean,
): void {
  const existing = test.setupFiles;
  const list: string[] = (
    Array.isArray(existing) ? existing : existing == null ? [] : [existing]
  ).filter((entry) => !files.includes(entry));
  let at = 0;
  if (after) {
    list.forEach((entry, index) => {
      if (typeof entry === "string" && after(entry)) at = index + 1;
    });
  }
  list.splice(at, 0, ...files);
  test.setupFiles = list;
  runSetupFilesInOrder(test);
}

/** Under `sequence.setupFiles: 'parallel'`, the project's setup files run in order. */
export function runSetupFilesInOrder(test: TestConfig): void {
  if (test.sequence?.setupFiles === "parallel") test.sequence.setupFiles = "list";
}
