import type { Plugin } from "vite";

// Matches the `jest` identifier ONLY when it is the object of a *hoistable* mock
// call: `jest.mock(` / `jest.unmock(` / `jest.doMock(` / `jest.doUnmock(` (with
// optional whitespace). The lookahead leaves `jest.fn`, `jest.spyOn`,
// `jest.mocked`, `jest.requireActual`, etc. untouched — those work at runtime via
// the `jest` global installed by jestCompatSetup.
const JEST_MOCK_CALL = /\bjest(?=\s*\.\s*(?:mock|unmock|doMock|doUnmock)\s*\()/g;
const TRANSFORMABLE = /\.(?:[cm]?[jt]sx?)$/;

/**
 * Vite plugin that rewrites a Jest suite's top-level `jest.mock(...)` to
 * `vi.mock(...)` so Vitest's hoister picks it up.
 *
 * Why this is needed: Vitest only hoists mock calls made on the `vi` / `vitest`
 * identifier (above the imports). An existing suite's
 * `jest.mock('react-native', factory)` therefore runs *after* the imports and
 * silently never applies — the single biggest mechanical blocker to migrating a
 * real Jest suite. `jestCompatSetup` makes `jest` an alias of `vi` at runtime,
 * but runtime aliasing can't fix a *compile-time* hoist.
 *
 * The rewrite is length-preserving — the 4-char `jest` token becomes `vi` + two
 * spaces — so every source position is unchanged and no sourcemap is required.
 * `vi  .mock(` is valid JS and matches Vitest's hoist regex (`vi\s*\.\s*mock`),
 * which then hoists and applies it exactly like a native `vi.mock`.
 *
 * Opt-in: add it to `plugins` after `reactNative()`, and pair it with
 * `jestCompatSetup` + `globals: true`.
 *
 * @example
 * ```ts
 * import { reactNative } from "vitest-native";
 * import { jestCompatSetup, jestMockTransform } from "vitest-native/jest-compat";
 * export default defineConfig({
 *   plugins: [reactNative({ engine: "native" }), jestMockTransform()],
 *   test: { globals: true, setupFiles: [jestCompatSetup] },
 * });
 * ```
 */
export function jestMockTransform(): Plugin {
  return {
    name: "vitest-native:jest-mock-hoist",
    // Run before Vitest's own `vitest:mocks` hoist plugin (which is enforce:post),
    // so it sees `vi.mock` rather than `jest.mock`.
    enforce: "pre",
    transform(code: string, id: string) {
      if (id.includes("/node_modules/")) return null;
      const file = id.split("?")[0];
      if (!TRANSFORMABLE.test(file)) return null;
      JEST_MOCK_CALL.lastIndex = 0;
      if (!JEST_MOCK_CALL.test(code)) return null;
      JEST_MOCK_CALL.lastIndex = 0;
      // `jest` (4 chars) → `vi` + 2 spaces (4 chars): length- and position-preserving.
      return { code: code.replace(JEST_MOCK_CALL, "vi  "), map: null };
    },
  };
}
