/**
 * Opt-in types for React Native Testing Library's matchers under Vitest.
 *
 * RNTL's matchers work at runtime under this plugin, but RNTL declares their types for
 * Jest. Before RNTL 14 nothing reached Vitest's `Assertion`, so `toHaveTextContent`,
 * `toHaveStyle`, `toBeVisible` and the rest were `Property 'x' does not exist on type
 * 'Assertion<...>'` for anyone who typechecks. RNTL 14 also augments the global
 * `jest.Matchers<R>`, which Vitest's `JestAssertion<T>` extends as `Matchers<void, T>`.
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
  // `void`, the same instantiation Vitest's JestAssertion inherits from RNTL 14's global
  // augmentation. Any other argument declares every matcher twice with different return
  // types, which TypeScript 7 rejects (TS2320) for RNTL 14 users; Vitest's own matchers
  // return void as well.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends JestNativeMatchers<void> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends JestNativeMatchers<void> {}
}
