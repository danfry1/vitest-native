import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";
import { createRequire } from "node:module";
import path from "node:path";

// react-native-unistyles 3 resolves styles in C++ through Nitro hybrid objects, so
// its JS cannot run without the native runtime. Its Babel plugin turns itself off
// when NODE_ENV is "test" (plugin/index.js), which Vitest sets, so the only thing to
// shadow is the module.
//
// The baseline is the library's own Jest mock (`react-native-unistyles/mocks`, the
// documented way to test with Unistyles): StyleSheet.configure() registers themes and
// breakpoints, StyleSheet.create() resolves a stylesheet function with the theme and
// a mini runtime, and useUnistyles() returns the theme. `tests/unistyles-preset.test.ts`
// runs that mock and holds this preset to its results.
//
// Where that mock does less than the library, this preset follows the library's JS
// instead, from the 3.x source:
// - variants: `getVariants` from src/web/variants.ts (the official mock strips them),
//   and `useVariants` selects in place, since the plugin's rewrite to a re-bound
//   `styles` is off under test;
// - the active theme: StyleSheet.configure()'s `initialTheme` and `adaptiveThemes`
//   rules and errors from the device runtime (cxx/hybridObjects/HybridStyleSheet.cpp,
//   HybridUnistylesRuntime.cpp; the official mock always uses the first theme), and
//   UnistylesRuntime.setTheme()/updateTheme()/setAdaptiveThemes() take effect. With
//   several themes and none selected the device throws on first use; this keeps the
//   official mock's fallback to the first theme, so a suite that passes under Jest
//   still does;
// - `mq` builds the same strings as src/mq.ts, and Display/Hide decide visibility
//   with useMedia's rules (src/hooks/useMedia.native.ts) against the screen size
//   (the official mock renders nothing for Display, Hide and ScopedTheme);
// - the runtime's screen, colour scheme and pixel ratio come from React Native's
//   Dimensions, Appearance and PixelRatio, as the device runtime's do.

let rnCache: Record<string, any> | null = null;
/** The active React Native: the mock engine's, or real RN under the native engine. */
function getRN(): Record<string, any> {
  if (rnCache) return rnCache;
  try {
    const base = path.join(process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd(), "package.json");
    rnCache = createRequire(base)("react-native");
  } catch {
    rnCache = {};
  }
  return rnCache!;
}

type Styles = Record<string, any>;
type Variants = Record<string, string | boolean | undefined>;

/** src/utils.ts `deepMergeObjects`. */
function deepMergeObjects(...sources: Styles[]): Styles {
  const target: Styles = {};
  for (const source of sources) {
    if (source === undefined || source === null) continue;
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      target[key] =
        Object(sourceValue) === sourceValue && Object(targetValue) === targetValue
          ? deepMergeObjects(targetValue, sourceValue)
          : sourceValue;
    }
  }
  return target;
}

/** src/web/variants.ts `getVariants`. */
function getVariants(style: Styles, selected: Variants): Styles {
  if (style === null || typeof style !== "object" || !("variants" in style)) return {};
  const variantStyles = Object.entries(style.variants as Record<string, Styles>).flatMap(
    ([variant, options]) => {
      const chosen = options[String(selected[variant])] ?? options.default;
      return chosen ? [chosen] : [];
    },
  );
  const compoundStyles = ((style.compoundVariants ?? []) as Styles[]).flatMap((compound) => {
    const { styles, ...conditions } = compound;
    const matches = Object.entries(conditions).every(
      ([variant, value]) => String(selected[variant]) === String(value),
    );
    return matches ? [styles] : [];
  });
  return deepMergeObjects(...variantStyles, ...compoundStyles);
}

/** A style with its variants applied and the variant keys removed. */
function applyVariants(style: unknown, selected: Variants): unknown {
  if (style === null || typeof style !== "object" || Array.isArray(style)) return style;
  const { variants: _variants, compoundVariants: _compound, ...base } = style as Styles;
  return deepMergeObjects(base, getVariants(style as Styles, selected));
}

const IS_MQ = /:([hw])\[(\d+)(?:,\s*(\d+|Infinity))?]/;
const MQ_WIDTH = /:(w)\[(\d+)(?:,\s*(\d+|Infinity))?]/;
const MQ_HEIGHT = /:(h)\[(\d+)(?:,\s*(\d+|Infinity))?]/;

/** src/utils.ts `parseMq` and `isValidMq`, and useMedia's visibility rule. */
function mqMatches(mq: unknown, screen: { width: number; height: number }): boolean {
  if (typeof mq !== "string" || !IS_MQ.test(mq)) return false;
  const [, w, fromW, toW] = MQ_WIDTH.exec(mq) || [];
  const [, h, fromH, toH] = MQ_HEIGHT.exec(mq) || [];
  const bound = (present: string | undefined, value: string | undefined) =>
    !present || value === "Infinity" || value === undefined ? undefined : Number(value);
  const minWidth = bound(w, fromW);
  const maxWidth = bound(w, toW);
  const minHeight = bound(h, fromH);
  const maxHeight = bound(h, toH);
  if (minWidth !== undefined && maxWidth !== undefined && minWidth > maxWidth) return false;
  if (minHeight !== undefined && maxHeight !== undefined && minHeight > maxHeight) return false;
  if (minWidth !== undefined && screen.width < minWidth) return false;
  if (maxWidth !== undefined && screen.width > maxWidth) return false;
  if (minHeight !== undefined && screen.height < minHeight) return false;
  if (maxHeight !== undefined && screen.height > maxHeight) return false;
  return true;
}

/** src/specs/NativePlatform/NativePlatform.nitro.ts */
const UnistyleDependency = {
  Theme: 0,
  ThemeName: 1,
  AdaptiveThemes: 2,
  Breakpoints: 3,
  Variants: 4,
  ColorScheme: 5,
  Dimensions: 6,
  Orientation: 7,
  ContentSizeCategory: 8,
  Insets: 9,
  PixelRatio: 10,
  FontScale: 11,
  StatusBar: 12,
  NavigationBar: 13,
  Ime: 14,
  Rtl: 15,
};
for (const [name, value] of Object.entries({ ...UnistyleDependency })) {
  (UnistyleDependency as Record<string | number, string | number>)[value] = name;
}

export function unistyles(): Preset {
  return {
    name: "unistyles",
    modules: {
      "react-native-unistyles": {
        exports: [
          "StyleSheet",
          "UnistylesRuntime",
          "UnistyleDependency",
          "ColorScheme",
          "Orientation",
          "StatusBarStyle",
          "mq",
          "withUnistyles",
          "useUnistyles",
          "createUnistylesElement",
          "IOSContentSizeCategory",
          "AndroidContentSizeCategory",
          "WebContentSizeCategory",
          "Display",
          "Hide",
          "ScopedTheme",
        ],
        factory: () => buildUnistyles(),
      },
      "react-native-unistyles/reanimated": {
        exports: ["useAnimatedTheme", "useAnimatedVariantColor"],
        factory: () => {
          // The official mock's shape: a shared value holding the current theme.
          const shared = (value: unknown) => ({ value, get: () => value, set: vi.fn() });
          const unistylesModule = (globalThis as any).__vitest_native_preset_mocks?.[
            "react-native-unistyles"
          ];
          return {
            useAnimatedTheme: vi.fn(() => shared(unistylesModule?.useUnistyles().theme ?? {})),
            useAnimatedVariantColor: vi.fn(() => ({
              fromValue: shared("#000000"),
              toValue: shared("#FFFFFF"),
            })),
          };
        },
      },
    },
  };
}

function buildUnistyles(): Record<string, any> {
  const registry = {
    themes: {} as Record<string, Styles>,
    breakpoints: {} as Record<string, number>,
    themeName: undefined as string | undefined,
    prefersAdaptive: false,
    configured: false,
  };

  // The device runtime's messages (cxx/), so a test fails the way the app would.
  const unistylesError = (message: string, cause?: unknown) =>
    new Error(`Unistyles: ${message}`, cause === undefined ? undefined : { cause });
  const assertTheme = (name: string, message: string) => {
    if (!(name in registry.themes)) throw unistylesError(message);
  };
  // UnistylesState::hasAdaptiveThemes: asked for, and both "light" and "dark" exist.
  const hasAdaptiveThemes = () =>
    registry.prefersAdaptive && "light" in registry.themes && "dark" in registry.themes;

  const screen = () => {
    const dims = getRN().Dimensions?.get?.("screen");
    return { width: dims?.width ?? 0, height: dims?.height ?? 0 };
  };
  const colorScheme = () => getRN().Appearance?.getColorScheme?.() ?? "unspecified";
  const currentTheme = (): Styles =>
    (registry.themeName && registry.themes[registry.themeName]) ||
    Object.values(registry.themes)[0] ||
    {};
  const selectThemeFromColorScheme = () => {
    registry.themeName = colorScheme() === "dark" ? "dark" : "light";
  };
  const currentBreakpoint = () => {
    const width = screen().width;
    return Object.entries(registry.breakpoints)
      .filter(([, min]) => width >= min)
      .sort(([, a], [, b]) => b - a)[0]?.[0];
  };

  const insets = { top: 0, left: 0, right: 0, bottom: 0, ime: 0 };
  const bar = { width: 0, height: 0 };
  const miniRuntime = {
    get themeName() {
      return registry.themeName;
    },
    get breakpoint() {
      return currentBreakpoint();
    },
    get hasAdaptiveThemes() {
      return hasAdaptiveThemes();
    },
    get colorScheme() {
      return colorScheme();
    },
    contentSizeCategory: "Medium",
    insets,
    get pixelRatio() {
      return getRN().PixelRatio?.get?.() ?? 1;
    },
    get fontScale() {
      return getRN().PixelRatio?.getFontScale?.() ?? 1;
    },
    get rtl() {
      return getRN().I18nManager?.isRTL ?? false;
    },
    get isLandscape() {
      const s = screen();
      return s.width > s.height;
    },
    get isPortrait() {
      const s = screen();
      return s.width <= s.height;
    },
    navigationBar: bar,
    get screen() {
      return screen();
    },
    statusBar: bar,
  };

  const UnistylesRuntime = {
    get themeName() {
      return registry.themeName;
    },
    get breakpoint() {
      return currentBreakpoint();
    },
    get breakpoints() {
      return registry.breakpoints;
    },
    get hasAdaptiveThemes() {
      return hasAdaptiveThemes();
    },
    get colorScheme() {
      return colorScheme();
    },
    contentSizeCategory: "Medium",
    get orientation() {
      return miniRuntime.isLandscape ? "landscape" : "portrait";
    },
    get isPortrait() {
      return miniRuntime.isPortrait;
    },
    get isLandscape() {
      return miniRuntime.isLandscape;
    },
    get pixelRatio() {
      return miniRuntime.pixelRatio;
    },
    get fontScale() {
      return miniRuntime.fontScale;
    },
    get rtl() {
      return miniRuntime.rtl;
    },
    insets,
    get screen() {
      return screen();
    },
    miniRuntime,
    name: "UnistylesRuntime",
    statusBar: {
      ...bar,
      name: "StatusBar",
      setHidden: vi.fn(),
      setStyle: vi.fn(),
      equals: () => false,
    },
    navigationBar: {
      ...bar,
      name: "NavigationBar",
      setHidden: vi.fn(),
      dispose: vi.fn(),
      equals: () => false,
    },
    getTheme: vi.fn((name?: string) => {
      if (name === undefined) return currentTheme();
      assertTheme(name, `You're trying to get theme '${name}' but it wasn't registered.`);
      return registry.themes[name];
    }),
    setTheme: vi.fn((name: string) => {
      if (hasAdaptiveThemes()) {
        throw unistylesError(
          `You're trying to set theme to: '${name}', but adaptiveThemes are enabled.`,
        );
      }
      assertTheme(name, `You're trying to set theme to: '${name}', but it wasn't registered.`);
      registry.themeName = name;
    }),
    updateTheme: vi.fn((name: string, updater: (theme: Styles) => Styles) => {
      assertTheme(name, `You're trying to update theme '${name}' but it wasn't registered.`);
      registry.themes[name] = updater(registry.themes[name]!);
    }),
    setAdaptiveThemes: vi.fn((enabled: boolean) => {
      registry.prefersAdaptive = enabled;
      if (hasAdaptiveThemes()) selectThemeFromColorScheme();
    }),
    setImmersiveMode: vi.fn(),
    setRootViewBackgroundColor: vi.fn(),
    dispose: vi.fn(),
    equals: () => false,
  };

  // Resolves a stylesheet on every read, so a theme switch shows on the next render
  // as it does on a device. useVariants() records the selection on the object it is
  // called on: under test the plugin's rewrite to a re-bound `styles` is off, so code
  // calls it and then reads the same `styles`.
  const create = vi.fn((stylesheet: Styles | ((theme: Styles, rt: unknown) => Styles)) => {
    let selected: Variants = {};
    const resolve = () => {
      if (typeof stylesheet !== "function") return stylesheet;
      try {
        return stylesheet(currentTheme(), miniRuntime);
      } catch (error) {
        if (registry.configured) throw error;
        // The device runtime's message for the same mistake (UnistylesState.cpp). In a
        // test it usually means the app's StyleSheet.configure() module was not loaded.
        throw unistylesError(
          "One of your stylesheets is trying to get the theme, but no theme has been " +
            "selected yet. Did you forget to call StyleSheet.configure? If you called it, " +
            "make sure you did so before any StyleSheet.create. In tests, import the module " +
            "that calls StyleSheet.configure from a setup file.",
          error,
        );
      }
    };
    const styles: Styles = {
      useVariants: vi.fn((variants: Variants) => {
        selected = { ...variants };
      }),
    };
    for (const key of Object.keys(resolve())) {
      Object.defineProperty(styles, key, {
        enumerable: true,
        get() {
          const value = resolve()[key];
          return typeof value === "function"
            ? (...args: unknown[]) => applyVariants(value(...args), selected)
            : applyVariants(value, selected);
        },
      });
    }
    return styles;
  });

  const configure = vi.fn(
    (config: {
      themes?: Record<string, Styles>;
      breakpoints?: Record<string, number>;
      settings?: { initialTheme?: string | (() => string); adaptiveThemes?: boolean };
    }) => {
      // HybridStyleSheet::configure / loadThemes, in its order.
      registry.configured = true;
      if (config.breakpoints) registry.breakpoints = config.breakpoints;
      if (config.themes) registry.themes = { ...config.themes };
      const settings = config.settings;
      registry.prefersAdaptive = settings?.adaptiveThemes ?? false;
      registry.themeName = undefined;
      const names = Object.keys(registry.themes);
      if (registry.prefersAdaptive && !hasAdaptiveThemes()) {
        throw unistylesError(
          "You're trying to enable adaptiveThemes, but you didn't register both 'light' and 'dark' themes.",
        );
      }
      const initialTheme =
        typeof settings?.initialTheme === "function"
          ? settings.initialTheme()
          : settings?.initialTheme;
      if (initialTheme === undefined) {
        if (hasAdaptiveThemes()) selectThemeFromColorScheme();
        else if (names.length === 1) registry.themeName = names[0];
        return;
      }
      if (hasAdaptiveThemes()) {
        throw unistylesError(
          "You're trying to set initial theme and enable adaptiveThemes, but these options are mutually exclusive.",
        );
      }
      assertTheme(
        initialTheme,
        `You're trying to select theme '${initialTheme}' but it wasn't registered.`,
      );
      registry.themeName = initialTheme;
    },
  );

  const absoluteFill = { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 };
  const StyleSheet = {
    absoluteFill,
    absoluteFillObject: absoluteFill,
    hairlineWidth: 1,
    compose: (styles: unknown) => styles,
    flatten: (styles: unknown) => styles,
    create,
    configure,
    addChangeListener: vi.fn(() => () => {}),
    init: vi.fn(),
    jsMethods: { processColor: () => null, parseBoxShadowString: () => [] },
    name: "StyleSheet",
    dispose: vi.fn(),
    equals: () => false,
  };

  const mqValue = (value: string | number | null | undefined) => {
    if (typeof value === "number") return value;
    if (value === null || value === undefined) return 0;
    return registry.breakpoints[value] ?? 0;
  };
  const range = (
    axis: "w" | "h",
    min: string | number | null = 0,
    max: string | number = Number.POSITIVE_INFINITY,
  ) => `:${axis}[${mqValue(min)}, ${mqValue(max)}]`;
  const mq = {
    only: {
      width: (min?: string | number | null, max?: string | number) => range("w", min, max),
      height: (min?: string | number | null, max?: string | number) => range("h", min, max),
    },
    width: (wMin?: string | number | null, wMax?: string | number) => ({
      and: {
        height: (hMin?: string | number | null, hMax?: string | number) =>
          range("w", wMin, wMax) + range("h", hMin, hMax),
      },
    }),
    height: (hMin?: string | number | null, hMax?: string | number) => ({
      and: {
        width: (wMin?: string | number | null, wMax?: string | number) =>
          range("w", wMin, wMax) + range("h", hMin, hMax),
      },
    }),
  };

  const useUnistyles = () => ({ theme: currentTheme(), rt: UnistylesRuntime });

  function Display({ mq: query, children }: { mq: unknown; children?: React.ReactNode }) {
    return mqMatches(query, screen()) ? React.createElement(React.Fragment, null, children) : null;
  }
  function Hide({ mq: query, children }: { mq: unknown; children?: React.ReactNode }) {
    return mqMatches(query, screen()) ? null : React.createElement(React.Fragment, null, children);
  }
  function ScopedTheme({ children }: { children?: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }

  const withUnistyles =
    (Component: any, mapper?: (theme: Styles, rt: unknown) => Styles) => (props: Styles) =>
      React.createElement(Component, { ...mapper?.(currentTheme(), miniRuntime), ...props });

  return {
    StyleSheet,
    UnistylesRuntime,
    UnistyleDependency,
    ColorScheme: { Light: "light", Dark: "dark", Unspecified: "unspecified" },
    Orientation: { Portrait: "portrait", Landscape: "landscape" },
    StatusBarStyle: { Default: "default", Light: "light", Dark: "dark" },
    IOSContentSizeCategory: {
      AccessibilityExtraExtraExtraLarge: "accessibilityExtraExtraExtraLarge",
      AccessibilityExtraExtraLarge: "accessibilityExtraExtraLarge",
      AccessibilityExtraLarge: "accessibilityExtraLarge",
      AccessibilityLarge: "accessibilityLarge",
      AccessibilityMedium: "accessibilityMedium",
      ExtraExtraExtraLarge: "xxxLarge",
      ExtraExtraLarge: "xxLarge",
      ExtraLarge: "xLarge",
      Large: "Large",
      Medium: "Medium",
      Small: "Small",
      ExtraSmall: "xSmall",
      Unspecified: "unspecified",
    },
    AndroidContentSizeCategory: {
      Small: "Small",
      Default: "Default",
      Large: "Large",
      ExtraLarge: "ExtraLarge",
      Huge: "Huge",
      ExtraHuge: "ExtraHuge",
      ExtraExtraHuge: "ExtraExtraHuge",
    },
    WebContentSizeCategory: { Unspecified: "web-unspecified" },
    mq,
    useUnistyles,
    withUnistyles,
    createUnistylesElement: (Component: unknown) => Component,
    Display,
    Hide,
    ScopedTheme,
  };
}
