/// <reference types="vitest" />
/**
 * Opt-in types for React Native Testing Library's matchers under Vitest.
 *
 * RNTL's matchers work at runtime under this plugin, but RNTL declares their types for
 * Jest. Before RNTL 14 nothing reached Vitest's `Assertion`, so `toHaveTextContent`,
 * `toHaveStyle`, `toBeVisible` and the rest were `Property 'x' does not exist on type
 * 'Assertion<...>'` for anyone who typechecks. RNTL 14 also augments the global
 * `jest.Matchers<R>`, which Vitest 4's `JestAssertion<T>` extends as `Matchers<void, T>`.
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
 * The matcher interface is declared here rather than imported: RNTL does not export it
 * from its entry point, and its internal location differs by major (`build/` in 12 and
 * 13, `dist/` in 14), so a deep import typed the matchers on one major and silently
 * dropped them on the others. Only the element type is version-specific
 * (`ReactTestInstance` before 14, `TestInstance` from 14); it is read from RNTL's public
 * `screen` API, so it is identical to the type RNTL's own global augmentation uses. A
 * different type declares `toContainElement` twice on Vitest 4, which TypeScript 7
 * reports as TS2320 under `skipLibCheck: false`.
 * tests/rntl-matchers-types.test.ts compares these members with the installed RNTL's.
 */
import type { screen } from "@testing-library/react-native";
import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from "react-native";

type HostElement = NonNullable<ReturnType<typeof screen.queryByText>>;
type TextMatch = string | RegExp;
type TextMatchOptions = { exact?: boolean; normalizer?: (text: string) => string };

interface RNTLMatchers<R> {
  toBeOnTheScreen(): R;
  toBeChecked(): R;
  toBeCollapsed(): R;
  toBeDisabled(): R;
  toBeBusy(): R;
  toBeEmptyElement(): R;
  toBeEnabled(): R;
  toBeExpanded(): R;
  toBePartiallyChecked(): R;
  toBeSelected(): R;
  toBeVisible(): R;
  toContainElement(instance: HostElement | null): R;
  toHaveAccessibilityValue(expectedValue: {
    min?: number;
    max?: number;
    now?: number;
    text?: TextMatch;
  }): R;
  toHaveAccessibleName(expectedName?: TextMatch, options?: TextMatchOptions): R;
  toHaveDisplayValue(expectedValue: TextMatch, options?: TextMatchOptions): R;
  toHaveProp(name: string, expectedValue?: unknown): R;
  toHaveStyle(style: StyleProp<ViewStyle | TextStyle | ImageStyle>): R;
  toHaveTextContent(expectedText: TextMatch, options?: TextMatchOptions): R;
}

declare module "vitest" {
  // `void`, the same instantiation Vitest 4's JestAssertion inherits from RNTL 14's global
  // augmentation. Any other argument declares every matcher twice with different return
  // types, which TypeScript 7 rejects (TS2320) for RNTL 14 users; Vitest's own matchers
  // return void as well. The type parameters follow Vitest 5's `Assertion<R, T>`; on
  // Vitest 4 with `skipLibCheck: false` that is reported as TS2428, and the matchers
  // stay typed.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<
    R extends void | Promise<void> = void,
    T = unknown,
  > extends RNTLMatchers<void> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends RNTLMatchers<void> {}
}
