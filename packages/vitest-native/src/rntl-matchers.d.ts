/**
 * Opt-in types for React Native Testing Library's matchers under Vitest.
 *
 * RNTL's matchers work at runtime under this plugin, but it declares their types only
 * for Jest — `dist/matchers/types.d.ts` augments the global `jest` namespace and the
 * `@jest/expect` module, and neither reaches Vitest's `Assertion`. Without this,
 * `toHaveTextContent`, `toHaveStyle`, `toBeVisible` and the rest are
 * `Property 'x' does not exist on type 'Assertion<...>'` for anyone who typechecks.
 *
 * Reference it once, anywhere in the project:
 *
 *   /// <reference types="vitest-native/rntl-matchers" />
 *
 * or add "vitest-native/rntl-matchers" to `compilerOptions.types` in tsconfig.json.
 *
 * SEPARATE, rather than folded into the package's main types, because
 * @testing-library/react-native is an OPTIONAL peer. An unresolvable type import
 * inside a shipped .d.ts is invisible under `skipLibCheck: true` — React Native's own
 * tsconfig default — but reports TS2307 under `skipLibCheck: false`, which would break
 * projects that use the mock engine without RNTL. Measured both ways before choosing
 * this shape. @testing-library/jest-dom ships its `/vitest` entry for the same reason.
 *
 * The import is a deep path because RNTL does not re-export the interface from its
 * entry point. It has no `exports` map, so the path resolves; if a future RNTL moves
 * it, this file fails loudly at the reference site rather than silently dropping the
 * matchers.
 */
import type { JestNativeMatchers } from "@testing-library/react-native/dist/matchers/types";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends JestNativeMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends JestNativeMatchers<void> {}
}
