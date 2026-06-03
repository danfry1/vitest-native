/**
 * Reanimated-compatible matchers: `toHaveAnimatedStyle` and `toHaveAnimatedProps`.
 *
 * react-native-reanimated ships these matchers via its Jest setup
 * (`setUpTests()`), so they are unavailable under Vitest by default — calling
 * `expect(node).toHaveAnimatedStyle(...)` throws `Invalid Chai property`.
 *
 * vitest-native's reanimated preset resolves animated hooks synchronously:
 * `useAnimatedStyle(updater)` returns `updater()` and the result is passed
 * through as the element's `style` prop (and `animatedProps` is passed through
 * verbatim). These matchers therefore read straight from the rendered element's
 * props, flattening style arrays the same way React Native does.
 */

type StyleLike = Record<string, unknown> | StyleLike[] | null | undefined | false;

/** Flatten a React Native `style` prop (object, array, or nested arrays). */
function flattenStyle(style: StyleLike): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, entry) => Object.assign(acc, flattenStyle(entry)),
      {},
    );
  }
  if (typeof style === "object") return style as Record<string, unknown>;
  return {};
}

/** Narrow an unknown value to something with a `props` bag. */
function getProps(received: unknown): Record<string, unknown> | null {
  if (received && typeof received === "object" && "props" in received) {
    const props = (received as { props?: unknown }).props;
    if (props && typeof props === "object") return props as Record<string, unknown>;
  }
  return null;
}

interface MatcherContext {
  isNot: boolean;
  equals: (a: unknown, b: unknown) => boolean;
  utils: {
    matcherHint: (name: string, received?: string, expected?: string, options?: unknown) => string;
    printExpected: (value: unknown) => string;
    printReceived: (value: unknown) => string;
    diff?: (a: unknown, b: unknown) => string | null;
  };
}

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

export interface AnimatedStyleConfig {
  /** When true, every key of the current style must match `expectedStyle` exactly. */
  shouldMatchAllProps?: boolean;
}

function notAnElementResult(
  ctx: MatcherContext,
  matcherName: string,
  received: unknown,
): MatcherResult {
  return {
    pass: false,
    message: () =>
      `${ctx.utils.matcherHint(matcherName, "element", "expected")}\n\n` +
      `Expected a rendered element with a \`props\` object, but received:\n` +
      `  ${ctx.utils.printReceived(received)}`,
  };
}

/** Pick only the keys present in `expected` from `actual`, for readable diffs. */
function subset(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(expected)) result[key] = actual[key];
  return result;
}

export function toHaveAnimatedStyle(
  this: MatcherContext,
  received: unknown,
  expectedStyle: Record<string, unknown>,
  config: AnimatedStyleConfig = {},
): MatcherResult {
  const props = getProps(received);
  if (!props) return notAnElementResult(this, "toHaveAnimatedStyle", received);

  const currentStyle = flattenStyle(props.style as StyleLike);
  const compared = config.shouldMatchAllProps ? currentStyle : subset(currentStyle, expectedStyle);
  const pass = this.equals(compared, expectedStyle);

  return {
    pass,
    message: () => {
      const hint = this.utils.matcherHint("toHaveAnimatedStyle", "element", "expectedStyle", {
        isNot: this.isNot,
      });
      if (pass) {
        return (
          `${hint}\n\n` +
          `Expected element not to have animated style:\n` +
          `  ${this.utils.printExpected(expectedStyle)}\n` +
          `Received:\n  ${this.utils.printReceived(compared)}`
        );
      }
      const diff = this.utils.diff?.(expectedStyle, compared);
      return diff
        ? `${hint}\n\n${diff}`
        : `${hint}\n\n` +
            `Expected: ${this.utils.printExpected(expectedStyle)}\n` +
            `Received: ${this.utils.printReceived(compared)}`;
    },
  };
}

export function toHaveAnimatedProps(
  this: MatcherContext,
  received: unknown,
  expectedProps: Record<string, unknown>,
): MatcherResult {
  const props = getProps(received);
  if (!props) return notAnElementResult(this, "toHaveAnimatedProps", received);

  // The preset passes `animatedProps` through verbatim; fall back to the
  // element's own props for components that spread them directly.
  const source =
    props.animatedProps && typeof props.animatedProps === "object"
      ? (props.animatedProps as Record<string, unknown>)
      : props;
  const compared = subset(source, expectedProps);
  const pass = this.equals(compared, expectedProps);

  return {
    pass,
    message: () => {
      const hint = this.utils.matcherHint("toHaveAnimatedProps", "element", "expectedProps", {
        isNot: this.isNot,
      });
      if (pass) {
        return (
          `${hint}\n\n` +
          `Expected element not to have animated props:\n` +
          `  ${this.utils.printExpected(expectedProps)}\n` +
          `Received:\n  ${this.utils.printReceived(compared)}`
        );
      }
      const diff = this.utils.diff?.(expectedProps, compared);
      return diff
        ? `${hint}\n\n${diff}`
        : `${hint}\n\n` +
            `Expected: ${this.utils.printExpected(expectedProps)}\n` +
            `Received: ${this.utils.printReceived(compared)}`;
    },
  };
}

/** All reanimated-compatible matchers, keyed by name for `expect.extend`. */
export const animatedMatchers = {
  toHaveAnimatedStyle,
  toHaveAnimatedProps,
};

// Augment Vitest's matcher interfaces so the matchers type-check for consumers.
// The matchers are auto-registered by vitest-native's setup file.
declare module "vitest" {
  interface Assertion<T = any> {
    toHaveAnimatedStyle(style: Record<string, unknown>, config?: AnimatedStyleConfig): T;
    toHaveAnimatedProps(props: Record<string, unknown>): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveAnimatedStyle(style: Record<string, unknown>, config?: AnimatedStyleConfig): unknown;
    toHaveAnimatedProps(props: Record<string, unknown>): unknown;
  }
}
