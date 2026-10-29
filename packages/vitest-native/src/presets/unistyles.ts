import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";
import { createRequire } from "node:module";
import path from "node:path";
import { builtInPreset } from "./built-in.js";
import { projectContext } from "../context.mjs";

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
// Where that mock does less than the library, this preset follows the device
// runtime's source (3.x):
// - every style is parsed as cxx/parser/Parser.cpp parses it: breakpoint and `mq`
//   values resolve against the screen (getValueFromBreakpoints), `_web` and
//   functions are dropped, and variants and compound variants apply by the device's
//   rules (parseVariants, getStylesForVariant, shouldApplyCompoundVariants);
// - StyleSheet.configure() validates its input and chooses the theme as
//   cxx/hybridObjects/HybridStyleSheet.cpp does, with the same messages; adaptive
//   themes follow the colour scheme, and UnistylesRuntime.setTheme()/updateTheme()/
//   setAdaptiveThemes() take effect. With several themes and none selected the
//   device throws on first use; this keeps the official mock's fallback to the first
//   theme, so a suite that passes under Jest still does;
// - ScopedTheme scopes the theme for its children (src/components/ScopedTheme.tsx,
//   NamedTheme.tsx, AdaptiveTheme.tsx), and withUnistyles applies `uniProps` and
//   merges as src/core/withUnistyles/withUnistyles.native.tsx does;
// - `mq` builds the same strings as src/mq.ts, and Display/Hide decide visibility
//   with useMedia's rules (src/hooks/useMedia.native.ts);
// - the runtime's screen, colour scheme and pixel ratio come from React Native's
//   Dimensions, Appearance and PixelRatio, as the device runtime's do.
//
// Two things a device does that a JS stand-in cannot: on a device, a theme or
// runtime change restyles mounted views natively, without a React render. Here,
// useUnistyles(), withUnistyles, Display, Hide and ScopedTheme re-render on a
// change; a component that only reads StyleSheet.create styles shows it on its next
// render. And the plugin binds a `useVariants` selection to each component; here the
// selection belongs to the stylesheet, so a style read after another instance
// selected different variants (a Pressable style function, on press) sees theirs.

let rnCache: Record<string, any> | null = null;
/** The active React Native: the mock engine's, or real RN under the native engine. */
function getRN(): Record<string, any> {
  if (rnCache) return rnCache;
  try {
    const base = path.join(projectContext()?.projectRoot ?? process.cwd(), "package.json");
    rnCache = createRequire(base)("react-native");
  } catch {
    rnCache = {};
  }
  return rnCache!;
}

type Styles = Record<string, any>;
type Variants = Record<string, unknown>;
type Screen = { width: number; height: number };

const isObject = (value: unknown): value is Styles =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** src/utils.ts `deepMergeObjects` (withUnistyles' merge). */
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

/** cxx/common/Helpers.h `isPlatformColor`: PlatformColor, DynamicColorIOS, Android resources. */
function isPlatformColor(value: Styles): boolean {
  // JSI's isObject() is true for arrays too: PlatformColor's `semantic` is one.
  const jsiObject = (v: unknown) => v !== null && typeof v === "object";
  return (
    jsiObject(value.semantic) ||
    (jsiObject(value.dynamic) && "dark" in value.dynamic && "light" in value.dynamic) ||
    jsiObject(value.resource_paths)
  );
}

const MQ = /:([hw])\[(\d+)(?:,\s*(\d+|Infinity))?]/;
const MQ_WIDTH = /:(w)\[(\d+)(?:,\s*(\d+|Infinity))?]/;
const MQ_HEIGHT = /:(h)\[(\d+)(?:,\s*(\d+|Infinity))?]/;

/** cxx/core/MediaQueries.cpp: an `mq` style key's range; no upper bound means exactly `from`. */
function styleMqMatches(key: string, screen: Screen): boolean {
  if (!MQ.test(key)) return false;
  const range = (match: RegExpExecArray | null) => {
    if (!match) return undefined;
    const from = Number(match[2]);
    const to =
      match[3] === undefined ? from : match[3] === "Infinity" ? Infinity : Number(match[3]);
    return { from, to };
  };
  const width = range(MQ_WIDTH.exec(key));
  const height = range(MQ_HEIGHT.exec(key));
  if ((width && width.from > width.to) || (height && height.from > height.to)) return false;
  const within = (r: { from: number; to: number } | undefined, value: number) =>
    !r || (value >= r.from && value <= r.to);
  return within(width, screen.width) && within(height, screen.height);
}

/** src/utils.ts `parseMq` and `isValidMq`, and useMedia's visibility rule (Display/Hide). */
function mediaMatches(query: unknown, screen: Screen): boolean {
  if (typeof query !== "string" || !MQ.test(query)) return false;
  const [, w, fromW, toW] = MQ_WIDTH.exec(query) || [];
  const [, h, fromH, toH] = MQ_HEIGHT.exec(query) || [];
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

/** cxx/common/Helpers.h `variantsToPairs`: the selection as the device keys it. */
function variantPairs(selected: Variants): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const [name, value] of Object.entries(selected)) {
    if (typeof value === "boolean") pairs.set(name, value ? "true" : "false");
    else if (typeof value === "string") pairs.set(name, value);
    else if (typeof value === "number") pairs.set(name, String(Math.trunc(value)));
  }
  return pairs;
}

/** The parts of the device runtime a style resolves against. */
interface ParseContext {
  screen: Screen;
  sortedBreakpoints: [string, number][];
  breakpoint: string | undefined;
}

/** cxx/parser/Parser.cpp `getValueFromBreakpoints`: `mq` keys first, then breakpoints down. */
function valueFromBreakpoints(value: Styles, ctx: ParseContext): unknown {
  for (const key of Object.keys(value)) {
    if (styleMqMatches(key, ctx.screen)) return value[key];
  }
  const orientation = ctx.screen.width > ctx.screen.height ? "landscape" : "portrait";
  if (ctx.sortedBreakpoints.length === 0 && orientation in value) return value[orientation];
  if (ctx.breakpoint === undefined) return undefined;
  const index = ctx.sortedBreakpoints.findIndex(([name]) => name === ctx.breakpoint);
  for (let i = index; i >= 0; i--) {
    const name = ctx.sortedBreakpoints[i]![0];
    if (name in value) return value[name];
  }
  return undefined;
}

/** cxx/parser/Parser.cpp `parseSecondLevel`. */
function parseSecondLevel(value: unknown, ctx: ParseContext): unknown {
  if (value === null || typeof value !== "object") {
    return typeof value === "string" || typeof value === "number" || value == null
      ? value
      : undefined;
  }
  if (Array.isArray(value)) return undefined;
  if (isPlatformColor(value as Styles)) return value;
  const parsed: Styles = {};
  for (const [key, nested] of Object.entries(value as Styles)) {
    if (key === "boxShadow" && typeof nested === "string") parsed[key] = nested;
    else if (nested === null || typeof nested !== "object") {
      parsed[key] = typeof nested === "function" ? undefined : nested;
    } else if (isPlatformColor(nested)) parsed[key] = nested;
    else if (key === "transform" && Array.isArray(nested))
      parsed[key] = parseTransforms(nested, ctx);
    else if ((key === "boxShadow" || key === "filter") && Array.isArray(nested)) {
      parsed[key] = nested.filter(isObject).map((item) => parseSecondLevel(item, ctx));
    } else if (key === "fontVariant") parsed[key] = nested;
    else if (key === "shadowOffset" || key === "textShadowOffset" || key === "dropShadow") {
      parsed[key] = parseSecondLevel(nested, ctx);
    } else if (!Array.isArray(nested)) parsed[key] = valueFromBreakpoints(nested, ctx);
  }
  return parsed;
}

/** cxx/parser/Parser.cpp `parseTransforms`: an entry whose value resolves to undefined is dropped. */
function parseTransforms(transforms: unknown[], ctx: ParseContext): unknown[] {
  return transforms
    .filter(isObject)
    .map((item) => parseSecondLevel(item, ctx) as Styles)
    .filter((item) => Object.values(item).some((v) => v !== undefined));
}

/** cxx/parser/Parser.cpp `parseVariants`, `getStylesForVariant`, `parseCompoundVariants`. */
function variantStyles(style: Styles, selected: Variants, ctx: ParseContext): Styles {
  const pairs = variantPairs(selected);
  const parsed: Styles = {};
  for (const [group, options] of Object.entries(style.variants as Styles)) {
    const chosen = pairs.get(group);
    const key = chosen ?? "default";
    const hasKey = isObject(options) && key in options;
    // An unselected group counts as "default" for compound variants; a selected one
    // keeps its value, whether or not it has that option.
    if (!hasKey || chosen === undefined) pairs.set(group, key);
    const styles = hasKey ? (options as Styles)[key] : undefined;
    if (isObject(styles)) Object.assign(parsed, parseSecondLevel(styles, ctx));
  }
  if (Array.isArray(style.compoundVariants) && pairs.size > 0) {
    for (const compound of style.compoundVariants as unknown[]) {
      if (!isObject(compound)) continue;
      const applies = [...pairs].every(([group, value]) => {
        if (!(group in compound)) return true;
        const condition = compound[group];
        const name =
          typeof condition === "boolean"
            ? String(condition)
            : typeof condition === "string"
              ? condition
              : "";
        return name === value;
      });
      if (applies) Object.assign(parsed, parseSecondLevel(compound.styles, ctx));
    }
  }
  return parsed;
}

/** cxx/parser/Parser.cpp `parseFirstLevel`: one style as the device applies it. */
function parseStyle(style: unknown, selected: Variants, ctx: ParseContext): unknown {
  if (!isObject(style)) return style;
  const parsed: Styles = {};
  for (const [key, value] of Object.entries(style)) {
    if (key === "_web" || key === "uni__dependencies") continue;
    if (key === "variants" || key === "compoundVariants") continue;
    if (key === "boxShadow" && typeof value === "string") parsed[key] = value;
    else if (typeof value === "number" || typeof value === "string" || value == null) {
      parsed[key] = value;
    } else if (typeof value === "boolean") {
      if (key === "includeFontPadding") parsed[key] = value;
    } else if (typeof value !== "object") {
      // A function at this level is dropped.
    } else if (key === "transform" && Array.isArray(value))
      parsed[key] = parseTransforms(value, ctx);
    else if ((key === "boxShadow" || key === "filter") && Array.isArray(value)) {
      parsed[key] = value.filter(isObject).map((item) => parseSecondLevel(item, ctx));
    } else if (key === "fontVariant" && Array.isArray(value)) parsed[key] = value;
    else if (key === "shadowOffset" || key === "textShadowOffset") {
      parsed[key] = parseSecondLevel(value, ctx);
    } else if (isPlatformColor(value)) parsed[key] = value;
    else if (Array.isArray(value)) parsed[key] = undefined;
    else parsed[key] = parseSecondLevel(valueFromBreakpoints(value, ctx), ctx);
  }
  if (isObject(style.variants)) Object.assign(parsed, variantStyles(style, selected, ctx));
  return parsed;
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
  return builtInPreset({
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
          "useServerUnistyles",
          "hydrateServerUnistyles",
          "getServerUnistyles",
          "resetServerUnistyles",
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
  });
}

type Config = {
  themes?: Record<string, Styles>;
  breakpoints?: Record<string, number>;
  settings?: {
    initialTheme?: string | (() => string);
    adaptiveThemes?: boolean;
    nativeBreakpointsMode?: "pixels" | "points";
    CSSVars?: boolean;
  };
};

function buildUnistyles(): Record<string, any> {
  // The configured state, and what configure() left it as, so `_reset` (run by
  // vitest-native's resetAllMocks()) returns to it rather than to a second constant.
  const configured = () => ({
    themes: {} as Record<string, Styles>,
    sortedBreakpoints: [] as [string, number][],
    themeName: undefined as string | undefined,
    prefersAdaptive: false,
    usePoints: false,
    configured: false,
  });
  let resting = configured();
  let registry = configured();
  let scopedTheme: string | undefined;

  // A change a mounted component should see: theme, runtime, configuration.
  let version = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    version++;
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    // The device runtime reports colour scheme and dimension changes too. Each
    // subscriber listens for itself, as React Native's useColorScheme does: a single
    // shared subscription would end at the first resetAllMocks(), which clears the
    // mock engine's Appearance and Dimensions listeners.
    const onPlatformChange = () => {
      version++;
      listener();
    };
    const appearance = getRN().Appearance?.addChangeListener?.(onPlatformChange);
    const dimensions = getRN().Dimensions?.addEventListener?.("change", onPlatformChange);
    return () => {
      listeners.delete(listener);
      appearance?.remove?.();
      dimensions?.remove?.();
    };
  };
  const useRuntimeVersion = () => React.useSyncExternalStore(subscribe, () => version);

  // The device runtime's messages (cxx/), so a test fails the way the app would.
  const deviceError = (message: string, cause?: unknown) =>
    new Error(message, cause === undefined ? undefined : { cause });
  const assertThat = (condition: unknown, message: string) => {
    if (!condition) throw deviceError(message);
  };
  // UnistylesState::hasAdaptiveThemes: asked for, and both "light" and "dark" exist.
  const hasAdaptiveThemes = () =>
    registry.prefersAdaptive && "light" in registry.themes && "dark" in registry.themes;

  const rawScreen = (): Screen => {
    const dims = getRN().Dimensions?.get?.("screen");
    return { width: dims?.width ?? 0, height: dims?.height ?? 0 };
  };
  const pixelRatio = (): number => getRN().PixelRatio?.get?.() ?? 1;
  /** HybridStyleSheet::parseBreakpoints / Parser: points mode divides by the pixel ratio. */
  const breakpointScreen = (): Screen => {
    const screen = rawScreen();
    const ratio = registry.usePoints ? pixelRatio() : 1;
    return { width: screen.width / ratio, height: screen.height / ratio };
  };
  const colorScheme = () => getRN().Appearance?.getColorScheme?.() ?? "unspecified";
  /** helpers::getBreakpointFromScreenWidth */
  const currentBreakpoint = () => {
    const pairs = registry.sortedBreakpoints;
    if (pairs.length === 0) return undefined;
    const width = Math.trunc(breakpointScreen().width);
    let found = pairs[0]![0];
    for (const [name, min] of pairs) if (width >= min) found = name;
    return found;
  };
  /** The selected theme: adaptive themes follow the colour scheme (HybridUnistylesRuntime). */
  const selectedThemeName = () =>
    hasAdaptiveThemes() ? (colorScheme() === "dark" ? "dark" : "light") : registry.themeName;
  const themeNameInScope = () => scopedTheme ?? selectedThemeName();
  const themeByName = (name: string | undefined): Styles => {
    if (name !== undefined && name === scopedTheme) {
      assertThat(
        name in registry.themes,
        `Unistyles: You're trying to use scoped theme '${name}' but it wasn't registered.`,
      );
    }
    return (name !== undefined && registry.themes[name]) || Object.values(registry.themes)[0] || {};
  };
  const currentTheme = (): Styles => themeByName(themeNameInScope());

  const insets = { top: 0, left: 0, right: 0, bottom: 0, ime: 0 };
  const bar = { width: 0, height: 0 };
  const miniRuntime = {
    get themeName() {
      return themeNameInScope();
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
      return pixelRatio();
    },
    get fontScale() {
      return getRN().PixelRatio?.getFontScale?.() ?? 1;
    },
    get rtl() {
      return getRN().I18nManager?.isRTL ?? false;
    },
    get isLandscape() {
      const s = rawScreen();
      return s.width > s.height;
    },
    get isPortrait() {
      const s = rawScreen();
      return s.width <= s.height;
    },
    navigationBar: bar,
    get screen() {
      return rawScreen();
    },
    statusBar: bar,
  };

  const assertRegistered = (name: string, message: string) =>
    assertThat(name in registry.themes, message);

  const UnistylesRuntime = {
    get themeName() {
      return selectedThemeName();
    },
    get breakpoint() {
      return currentBreakpoint();
    },
    get breakpoints() {
      return Object.fromEntries(registry.sortedBreakpoints);
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
      return rawScreen();
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
      if (name === undefined) return themeByName(selectedThemeName());
      assertRegistered(
        name,
        `Unistyles: You're trying to get theme '${name}' but it wasn't registered.`,
      );
      return registry.themes[name];
    }),
    setTheme: vi.fn((name: string) => {
      assertThat(
        !hasAdaptiveThemes(),
        `Unistyles: You're trying to set theme to: '${name}', but adaptiveThemes are enabled.`,
      );
      assertRegistered(
        name,
        `Unistyles: You're trying to set theme to: '${name}', but it wasn't registered.`,
      );
      registry.themeName = name;
      notify();
    }),
    updateTheme: vi.fn((name: string, updater: (theme: Styles) => Styles) => {
      assertRegistered(
        name,
        `Unistyles: You're trying to update theme '${name}' but it wasn't registered.`,
      );
      registry.themes = { ...registry.themes, [name]: updater(registry.themes[name]!) };
      notify();
    }),
    setAdaptiveThemes: vi.fn((enabled: boolean) => {
      // Turning them off keeps the theme the colour scheme had chosen (HybridUnistylesRuntime).
      registry.themeName = selectedThemeName();
      registry.prefersAdaptive = enabled;
      notify();
    }),
    setImmersiveMode: vi.fn(),
    setRootViewBackgroundColor: vi.fn(),
    dispose: vi.fn(),
    equals: () => false,
  };

  // Each read of a style resolves it against the current theme and runtime, so a
  // theme switch shows on the next render, as it does on a device; the result is
  // cached while nothing it depends on changes, so a style is the same object from
  // read to read. useVariants() records the selection on the stylesheet it is called
  // on: under test the plugin's rewrite to a re-bound `styles` is off, so code calls
  // it and then reads the same `styles`.
  const create = vi.fn((stylesheet: Styles | ((theme: Styles, rt: unknown) => Styles)) => {
    // HybridStyleSheet::create
    assertThat(
      typeof stylesheet === "function" || isObject(stylesheet),
      "StyleSheet.create expected to be called with object or function.",
    );
    let selected: Variants = {};
    const raw = new Map<string, Styles>();
    const parsed = new Map<string, unknown>();
    const stateKey = () => {
      const screen = rawScreen();
      return [
        version,
        themeNameInScope(),
        screen.width,
        screen.height,
        colorScheme(),
        pixelRatio(),
        miniRuntime.rtl,
      ].join("|");
    };
    const resolve = (key: string): Styles => {
      if (typeof stylesheet !== "function") return stylesheet;
      const cached = raw.get(key);
      if (cached) return cached;
      let sheet: Styles;
      try {
        sheet = stylesheet(currentTheme(), miniRuntime);
      } catch (error) {
        if (registry.configured) throw error;
        // The device runtime's message for the same mistake (UnistylesState.cpp). In a
        // test it usually means the app's StyleSheet.configure() module was not loaded.
        throw deviceError(
          "Unistyles: One of your stylesheets is trying to get the theme, but no theme has " +
            "been selected yet. Did you forget to call StyleSheet.configure? If you called " +
            "it, make sure you did so before any StyleSheet.create. In tests, import the " +
            "module that calls StyleSheet.configure from a setup file.",
          error,
        );
      }
      raw.clear();
      raw.set(key, sheet);
      return sheet;
    };
    const context = (): ParseContext => ({
      screen: breakpointScreen(),
      sortedBreakpoints: registry.sortedBreakpoints,
      breakpoint: currentBreakpoint(),
    });
    const styles: Styles = {
      useVariants: vi.fn((variants: Variants) => {
        selected = { ...variants };
      }),
    };
    const initial = resolve(stateKey());
    // Parser::buildUnistyles
    for (const [name, value] of Object.entries(initial)) {
      assertThat(
        typeof value === "function" || isObject(value),
        `Unistyles: Style with name '${name}' is not a function or object.`,
      );
    }
    for (const name of Object.keys(initial)) {
      Object.defineProperty(styles, name, {
        enumerable: true,
        get() {
          const key = stateKey();
          const value = resolve(key)[name];
          if (typeof value === "function") {
            return (...args: unknown[]) => parseStyle(value(...args), selected, context());
          }
          const cacheKey = `${key}|${name}|${JSON.stringify(selected)}`;
          if (!parsed.has(cacheKey)) {
            if (parsed.size > 256) parsed.clear();
            parsed.set(cacheKey, parseStyle(value, selected, context()));
          }
          return parsed.get(cacheKey);
        },
      });
    }
    return styles;
  });

  /** HybridStyleSheet::configure, parseSettings, parseBreakpoints, parseThemes, verifyAndSelectTheme. */
  const configure = vi.fn((config: Config) => {
    const next = { ...registry, configured: true };
    let initialTheme: string | undefined;
    for (const [key, value] of Object.entries(config ?? {})) {
      if (key === "settings") {
        assertThat(isObject(value), "StyleSheet.configure's settings must be an object.");
        next.usePoints = false;
        for (const [setting, settingValue] of Object.entries(value as Styles)) {
          if (setting === "adaptiveThemes") {
            assertThat(
              typeof settingValue === "boolean",
              "StyleSheet.configure's adaptiveThemes must be of boolean type.",
            );
            next.prefersAdaptive = settingValue;
          } else if (setting === "initialTheme") {
            if (typeof settingValue === "function") {
              const result = settingValue();
              assertThat(
                typeof result === "string",
                "StyleSheet.configure's initialTheme resolved from function is not a string. Please check your initialTheme function.",
              );
              initialTheme = result;
            } else {
              assertThat(
                typeof settingValue === "string",
                "StyleSheet.configure's initialTheme must be either a string or a function.",
              );
              initialTheme = settingValue;
            }
          } else if (setting === "nativeBreakpointsMode") {
            assertThat(
              typeof settingValue === "string",
              "StyleSheet.configure's nativeBreakpointsMode must be a string",
            );
            assertThat(
              settingValue === "pixels" || settingValue === "points",
              "StyleSheet.configure's nativeBreakpointsMode must be one of: pixels or points",
            );
            next.usePoints = settingValue === "points";
          } else if (setting !== "CSSVars") {
            throw deviceError(
              `StyleSheet.configure's settings received unexpected key: '${setting}'`,
            );
          }
        }
      } else if (key === "breakpoints") {
        assertThat(isObject(value), "StyleSheet.configure's breakpoints must be an object.");
        const pairs = Object.entries(value as Styles).map(([name, min]): [string, number] => {
          assertThat(typeof min === "number", `value for breakpoint ${name} is not a number.`);
          return [name, min];
        });
        pairs.sort(([, a], [, b]) => a - b);
        assertThat(pairs.length > 0, "StyleSheet.configure's breakpoints can't be empty.");
        assertThat(
          pairs[0]![1] === 0,
          "StyleSheet.configure's first breakpoint must start from 0.",
        );
        next.sortedBreakpoints = pairs;
      } else if (key === "themes") {
        assertThat(isObject(value), "StyleSheet.configure's themes must be an object.");
        const themes = { ...next.themes };
        for (const [name, theme] of Object.entries(value as Styles)) {
          assertThat(
            isObject(theme),
            `StyleSheet.configure's registered theme '${name}' must be an object.`,
          );
          themes[name] = theme;
        }
        next.themes = themes;
      } else {
        throw deviceError(`StyleSheet.configure received unexpected key: '${key}'.`);
      }
    }
    // verifyAndSelectTheme
    const names = Object.keys(next.themes);
    const adaptive = next.prefersAdaptive && "light" in next.themes && "dark" in next.themes;
    assertThat(
      !next.prefersAdaptive || adaptive,
      "Unistyles: You're trying to enable adaptiveThemes, but you didn't register both 'light' and 'dark' themes.",
    );
    if (initialTheme === undefined) {
      if (!adaptive && names.length === 1) next.themeName = names[0];
    } else {
      assertThat(
        !adaptive,
        "Unistyles: You're trying to set initial theme and enable adaptiveThemes, but these options are mutually exclusive.",
      );
      assertThat(
        initialTheme in next.themes,
        `Unistyles: You're trying to select theme '${initialTheme}' but it wasn't registered.`,
      );
      next.themeName = initialTheme;
    }
    registry = next;
    resting = { ...next };
    notify();
  });

  // src/specs/StyleSheet: absoluteFill, flatten and compose are React Native's own.
  const StyleSheet = {
    get absoluteFill() {
      return getRN().StyleSheet.absoluteFill;
    },
    get absoluteFillObject() {
      return getRN().StyleSheet.absoluteFill;
    },
    /** HybridStyleSheet::getHairlineWidth */
    get hairlineWidth() {
      const ratio = pixelRatio();
      return Math.round(ratio * 0.4) / ratio || 1 / ratio;
    },
    compose: (a: unknown, b: unknown) => getRN().StyleSheet.compose(a, b),
    flatten: (style: unknown) => getRN().StyleSheet.flatten(style),
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
    return Object.fromEntries(registry.sortedBreakpoints)[value] ?? 0;
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

  /** src/core/useUnistyles: the theme in scope when the component mounted. */
  const useUnistyles = () => {
    useRuntimeVersion();
    const [scoped] = React.useState(scopedTheme);
    return {
      theme: scoped !== undefined ? themeByName(scoped) : currentTheme(),
      rt: UnistylesRuntime,
    };
  };

  function Display({ mq: query, children }: { mq: unknown; children?: React.ReactNode }) {
    useRuntimeVersion();
    return mediaMatches(query, rawScreen())
      ? React.createElement(React.Fragment, null, children)
      : null;
  }
  function Hide({ mq: query, children }: { mq: unknown; children?: React.ReactNode }) {
    useRuntimeVersion();
    return mediaMatches(query, rawScreen())
      ? null
      : React.createElement(React.Fragment, null, children);
  }

  // src/components: ApplyScopedTheme sets the scoped theme as it renders, and its
  // siblings render in order, so the children between two of them read it.
  function ApplyScopedTheme({ name }: { name: string | undefined }) {
    scopedTheme = name;
    React.useLayoutEffect(() => {
      scopedTheme = name;
    });
    return null;
  }
  const withScope = (
    name: string | undefined,
    previous: string | undefined,
    children: React.ReactNode,
  ) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(ApplyScopedTheme, { key: "apply", name }),
      children,
      React.createElement(ApplyScopedTheme, { key: "dispose", name: previous }),
    );
  function ScopedTheme({
    name,
    invertedAdaptive,
    reset,
    children,
  }: {
    name?: string;
    invertedAdaptive?: boolean;
    reset?: boolean;
    children?: React.ReactNode;
  }) {
    useRuntimeVersion();
    const previous = scopedTheme;
    if (name !== undefined) return withScope(name, previous, children);
    if (invertedAdaptive && hasAdaptiveThemes()) {
      return withScope(colorScheme() === "dark" ? "light" : "dark", previous, children);
    }
    if (reset) return withScope(undefined, previous, children);
    return React.createElement(React.Fragment, null, children);
  }

  /** src/core/withUnistyles/withUnistyles.native.tsx */
  const flattenStyle = (style: unknown): Styles =>
    (Array.isArray(style) ? style.flat(Infinity) : [style])
      .filter(Boolean)
      .reduce((merged: Styles, item) => Object.assign(merged, item), {});
  const withUnistyles = (Component: any, mappings?: (theme: Styles, rt: unknown) => Styles) =>
    React.forwardRef((props: Styles, ref) => {
      const { theme } = useUnistyles();
      const { key: mappingsKey, ...mappingsProps } = mappings?.(theme, miniRuntime) ?? {};
      const { key: uniPropsKey, ...uniProps } = props.uniProps?.(theme, miniRuntime) ?? {};
      const finalProps = {
        ...deepMergeObjects(mappingsProps, uniProps, props),
        ...(props.style ? { style: flattenStyle(props.style) } : {}),
        ...(props.contentContainerStyle
          ? { contentContainerStyle: flattenStyle(props.contentContainerStyle) }
          : {}),
      };
      return React.createElement(Component, {
        key: uniPropsKey || mappingsKey,
        ...finalProps,
        ref,
      });
    });

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
    // Server rendering (src/server) is for the web; a React Native app has nothing to
    // render on a server or hydrate.
    useServerUnistyles: () => null,
    hydrateServerUnistyles: () => {},
    getServerUnistyles: () => null,
    resetServerUnistyles: () => {},
    // vitest-native's resetAllMocks(): back to what StyleSheet.configure() set.
    // It changes the version without re-rendering: a reset in afterEach runs while the
    // test's components are still mounted, before they unmount, and a re-render
    // outside act() would warn in every test.
    _reset: () => {
      registry = { ...resting, themes: { ...resting.themes } };
      scopedTheme = undefined;
      version++;
    },
  };
}
