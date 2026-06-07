/**
 * vitest-native/jest-compat — helpers for running an existing Jest-based RN test
 * suite under Vitest. This clears the *Jest-API coupling* (the `jest` global,
 * `@jest/globals`, jest-native's extend-expect). It does NOT do a full migration
 * on its own — see the migration guide for the per-suite cleanup still required
 * (top-level `jest.mock` → `vi.mock`, RNTL ≥ 12, third-party presets).
 *
 * @example
 * ```ts
 * // vitest.config.mts
 * import { defineConfig } from "vitest/config";
 * import { reactNative } from "vitest-native";
 * import { jestCompatAliases, jestCompatSetup } from "vitest-native/jest-compat";
 *
 * export default defineConfig({
 *   plugins: [reactNative({ engine: "native" })],
 *   resolve: { alias: jestCompatAliases() },
 *   test: { globals: true, setupFiles: [jestCompatSetup] },
 * });
 * ```
 */

export { jestMockTransform } from "./transform.js";

/** Setup-file specifier: gives the suite a `jest` global backed by Vitest's `vi`. */
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
