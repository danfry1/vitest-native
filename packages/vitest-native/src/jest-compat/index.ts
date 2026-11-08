/**
 * vitest-native/jest-compat — runs an existing Jest-based React Native suite under Vitest
 * with its Jest API calls left as they are. Three pieces, used together:
 *
 * - `jestCompatSetup` (a setup file): a `jest` global backed by Vitest's `vi`, with the
 *   synchronous `jest.requireActual` and `jest.requireMock` Vitest only has as the async
 *   `vi.importActual`.
 * - `jestMockTransform()` (a plugin): rewrites a top-level `jest.mock(...)` to a hoisted
 *   `vi.mock(...)`, so it applies before the imports, as Jest's does, and registers it
 *   for Node's `require` of the module too.
 * - `jestCompatAliases()` (`resolve.alias`): `@jest/globals` for RNTL < 12, and
 *   jest-native's `extend-expect` as a no-op.
 *
 * What stays a per-suite change (see https://danfry1.github.io/vitest-native/migration/from-jest): upgrading
 * `@testing-library/react-native` to 12–14, and deleting the mocks of third-party native
 * libraries, which vitest-native's presets cover.
 *
 * @example
 * ```ts
 * // vitest.config.mts
 * import { defineConfig } from "vitest/config";
 * import { reactNative } from "vitest-native";
 * import { jestCompatAliases, jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";
 *
 * export default defineConfig({
 *   plugins: [reactNative({ engine: "native" }), jestMockTransform()],
 *   resolve: { alias: jestCompatAliases() },
 *   test: { globals: true, setupFiles: [jestCompatSetup] },
 * });
 * ```
 */

export { jestMockTransform, type JestMockTransformOptions } from "./transform.js";

/**
 * Setup-file specifier: gives the suite a `jest` global backed by Vitest's `vi`, with the
 * synchronous `jest.requireActual` and `jest.requireMock`.
 */
export const jestCompatSetup = "vitest-native/jest-compat/setup";

/**
 * `resolve.alias` entries that redirect Jest-only modules to Vitest-backed shims:
 * - `@jest/globals` → a shim re-exporting Vitest globals (unblocks RNTL < 12)
 * - `@testing-library/jest-native/extend-expect` → a no-op (matchers are already
 *   registered by vitest-native's setup)
 *
 * Spread into your config's `resolve.alias`.
 */
export function jestCompatAliases(): Record<string, string> {
  return {
    "@jest/globals": "vitest-native/jest-compat/jest-globals",
    "@testing-library/jest-native/extend-expect": "vitest-native/jest-compat/extend-expect-noop",
  };
}
