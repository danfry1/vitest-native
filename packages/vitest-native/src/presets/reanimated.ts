import type { Preset } from "../types.js";
import { vi } from "vitest";
import React from "react";
import { createRequire, Module } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { VitestNativeError } from "../errors.mjs";
import { builtInPreset } from "./built-in.js";
import { libraryMockModule, underNativeEngine, workerRoot } from "./library-mock.js";
import { libraryMockUsable, reanimatedDir, type LibraryMock } from "../preset-map.js";

// Under the native engine the module is reanimated's own test mock
// (`react-native-reanimated/mock`), as a Jest suite gets it with
// `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`:
// its whole API, current with the installed version, over the real package in its JS
// implementation. It loads because the engine applies reanimated's own Jest resolver
// (native/jest-resolvers.mjs), which reanimated ships from 4.7 and worklets from 0.9;
// with an older one installed, and under the mock engine, which has no real React
// Native for the real package to run on, the module below serves.

/**
 * Whether reanimated's own mock can run: it loads the real package, whose JS
 * implementation loads only through reanimated's and worklets' Jest resolvers
 * (reanimated 4.7, worklets 0.9). Before those, the real package's `.native`
 * initializers throw, and the module below serves instead, as under the mock engine.
 */
const REANIMATED_MOCK: LibraryMock = {
  pkg: "react-native-reanimated",
  entry: "mock",
  file: "lib/module/mock.js",
  // mock.js spreads mock-svg's names over the core mock.
  alsoFiles: ["lib/module/mock-svg.js"],
  // Its JS implementation loads only through reanimated's and worklets' Jest resolvers,
  // over worklets' own mock (preset-map.ts, libraryMockUsable).
  available: (_dir, root) => libraryMockUsable(root),
  // Reanimated's mock (4.7.1, and its main branch in October 2026) answers `interpolate`,
  // `interpolateColor` and `clamp` with a no-op, so every interpolated style is
  // `undefined`; its `useAnimatedScrollHandler` and `useComposedEventHandler` never run
  // their handlers; its `useScrollOffset` and `useScrollViewOffset` return
  // `{ value: 0 }`, which is not a shared value; and its shared values have no
  // listeners, which Gesture Handler 3 adds to one given as gesture config. Those
  // names, and only while the mock's value still behaves so (mockCorrections), are
  // replaced: the helpers by reanimated's own (ownHelpers), the rest by ones that work
  // (scrollHandlers, withListeners). A reanimated whose mock does better keeps its own.
  // Under the native engine, beside the mock its library registry serves.
  extend: (mock, dir) => mockCorrections(mock, dir, true),
};

type Fn = (...args: any[]) => any;
type Helpers = Partial<Record<"interpolate" | "clamp" | "interpolateColor", Fn>>;

/** Whether `probe` returns `undefined` (a no-op), without throwing. */
function returnsNothing(probe: () => unknown): boolean {
  try {
    return probe() === undefined;
  } catch {
    return false;
  }
}

/**
 * `probe()`, with console.error silent while it runs. The probes call a mock's hooks
 * outside a render, where a hook that needs React logs "Invalid hook call" before it
 * throws; that is how a working hook is told apart, not something to report.
 */
function quietly<T>(probe: () => T): T {
  const error = console.error;
  console.error = () => {};
  try {
    return probe();
  } finally {
    console.error = error;
  }
}

/**
 * A scroll event as a scroll view's `onScroll` receives it, named as reanimated names
 * the events its handlers dispatch on (`eventName` ending in "onScroll").
 */
const PROBE_SCROLL_EVENT = {
  eventName: "onScroll",
  nativeEvent: {
    eventName: "onScroll",
    contentOffset: { x: 0, y: 0 },
    contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
    contentSize: { width: 0, height: 0 },
    layoutMeasurement: { width: 0, height: 0 },
    zoomScale: 1,
  },
};

/** Whether an event handler built by `build` from a handler never calls it. */
function neverCalls(build: (handler: () => void) => unknown): boolean {
  return quietly(() => {
    try {
      let called = false;
      const built = build(() => {
        called = true;
      });
      // Outside a render: a hook that needs React throws, and is taken as working.
      if (typeof built === "function") built(PROBE_SCROLL_EVENT);
      return !called;
    } catch {
      return false;
    }
  });
}

/** Whether `useOffset` (called outside a render) returns something that is not a shared value. */
function notASharedValue(useOffset: unknown): boolean {
  if (typeof useOffset !== "function") return false;
  return quietly(() => {
    try {
      const value = useOffset();
      return !(value && typeof value.get === "function");
    } catch {
      return false;
    }
  });
}

/** Whether `useSharedValue` (called outside a render) gives a value without listeners. */
function lacksListeners(useSharedValue: unknown): boolean {
  if (typeof useSharedValue !== "function") return false;
  return quietly(() => {
    try {
      const value = useSharedValue(0);
      return (
        value !== null &&
        typeof value === "object" &&
        (typeof value.addListener !== "function" || typeof value.removeListener !== "function")
      );
    } catch {
      return false;
    }
  });
}

/**
 * `shared`, with a shared value's listeners: `addListener(id, listener)` and
 * `removeListener(id)`, each listener called with the new value when `.value` is
 * assigned or `.set()` called, as on reanimated's shared values. Gesture Handler 3
 * listens to a shared value given as gesture config (`usePanGesture({ enabled })`).
 */
function withListeners<T extends object>(shared: T): T {
  const listeners = new Map<unknown, (value: unknown) => void>();
  const notify = () => {
    for (const listener of listeners.values()) listener((shared as { value?: unknown }).value);
  };
  return new Proxy(shared, {
    get(target, prop) {
      if (prop === "addListener") {
        return (id: unknown, listener: (value: unknown) => void) => {
          listeners.set(id, listener);
        };
      }
      if (prop === "removeListener") return (id: unknown) => listeners.delete(id);
      const value = (target as Record<PropertyKey, unknown>)[prop];
      if (prop === "set" && typeof value === "function") {
        return (next: unknown) => {
          value(next);
          notify();
        };
      }
      return value;
    },
    has(target, prop) {
      return prop === "addListener" || prop === "removeListener" || Reflect.has(target, prop);
    },
    set(target, prop, next) {
      const done = Reflect.set(target, prop, next);
      if (done && prop === "value") notify();
      return done;
    },
  });
}

/**
 * Reanimated's mock, with the names it answers with a no-op replaced (see
 * REANIMATED_MOCK). Exported for its tests.
 */
export function mockCorrections(
  mock: Record<string, any>,
  dir: string,
  fromRegistry = false,
): Record<string, any> {
  const helpers = ownHelpers(dir, fromRegistry);
  const probes: Record<keyof Helpers, (f: Fn) => unknown> = {
    interpolate: (f) => f(5, [0, 10], [0, 100]),
    clamp: (f) => f(5, 0, 3),
    interpolateColor: (f) => f(0, [0, 1], ["#ff0000", "#0000ff"]),
  };
  const fixHelpers = (target: Record<string, any> | undefined) => {
    const fixed: Record<string, Fn> = {};
    for (const name of Object.keys(probes) as (keyof Helpers)[]) {
      const own = helpers[name];
      const current = target?.[name];
      if (own && typeof current === "function" && returnsNothing(() => probes[name](current))) {
        fixed[name] = own;
      }
    }
    return fixed;
  };
  const handlers = scrollHandlers(mock.useSharedValue);
  const fixed: Record<string, any> = { ...fixHelpers(mock) };
  const scrollFixed = neverCalls((h) => mock.useAnimatedScrollHandler?.({ onScroll: h }));
  if (scrollFixed) fixed.useAnimatedScrollHandler = handlers.useAnimatedScrollHandler;
  if (neverCalls((h) => mock.useComposedEventHandler?.([h]))) {
    fixed.useComposedEventHandler = handlers.useComposedEventHandler;
  }
  // Shared values without listeners get them; the offsets below are built on the result.
  let useSharedValue = mock.useSharedValue;
  if (lacksListeners(mock.useSharedValue)) {
    const own = mock.useSharedValue;
    useSharedValue = (init: unknown) => withListeners(own(init));
    fixed.useSharedValue = useSharedValue;
  }
  const offsets = scrollHandlers(useSharedValue).useScrollOffset;
  for (const name of ["useScrollOffset", "useScrollViewOffset"]) {
    if (notASharedValue(mock[name])) fixed[name] = offsets;
  }
  const defaults: Record<string, any> = { ...mock.default, ...fixHelpers(mock.default) };
  // The scroll views pass a handler's drag and momentum handlers on (withScrollEvents).
  if (scrollFixed) {
    for (const name of ["ScrollView", "FlatList"]) {
      if (defaults[name]) defaults[name] = withScrollEvents(defaults[name]);
    }
  }
  return { ...mock, ...fixed, default: defaults };
}

/**
 * Loads one of reanimated's own files by path as Node loads any module (through the
 * engine's transform, under the native engine), but not into the module cache, and
 * with `stubbed` requests of that file answered by `stub`. interpolateColor.js before
 * 4.5 imports reanimated's core and `useSharedValue` for `useInterpolateConfig` alone,
 * and loading those initializes reanimated, which fails ("Native part of Reanimated
 * doesn't seem to be initialized") and leaves its globals set.
 */
function loadOwnFile(file: string, stubbed: RegExp, stub: object): Record<string, any> {
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = (Module as any)._nodeModulePaths(path.dirname(file));
  mod.require = function (this: Module, request: string) {
    return stubbed.test(request) ? stub : Module.prototype.require.call(this, request);
  } as Module["require"];
  (Module as any)._extensions[".js"](mod, file);
  mod.loaded = true;
  return mod.exports;
}

/** What interpolateColor.js's core imports become (see loadOwnFile). */
const NOT_LOADED = new Proxy(
  {},
  {
    get: (_target, name) =>
      name === "__esModule"
        ? true
        : () => {
            throw new VitestNativeError(
              "PRESET_UNAVAILABLE",
              `reanimated's ${String(name)} is not available to interpolateColor here.`,
            );
          },
  },
);

/**
 * Reanimated's own `interpolate`, `clamp` and `interpolateColor`, loaded from the
 * installed package's files (by name, the preset answers): plain functions, which
 * reanimated also runs on the JS thread. A file that does not load is left out, and
 * its names keep what the module had. Under the native engine both load from 3.17 on;
 * under the mock engine, which runs no transform, interpolateColor.js does not load
 * (it imports React Native's Flow source), nor, before 4.5, does interpolation.js
 * (its imports have no file extension, which Node's ES module loader rejects).
 */
function ownHelpers(dir: string, fromRegistry = false): Helpers {
  const helpers: Helpers = {};
  // Beside reanimated's own mock the files are already modules of its graph, which the
  // library registry holds: a require by path is served from there, at no Node load.
  const required = createRequire(path.join(dir, "package.json"));
  const files: Record<string, (keyof Helpers)[]> = {
    "lib/module/interpolation.js": ["interpolate", "clamp"],
    "lib/module/interpolateColor.js": ["interpolateColor"],
  };
  for (const [file, names] of Object.entries(files)) {
    // The registry holds the files the package's react-native field leads to (src/).
    const source = path.join(dir, file.replace(/^lib\/module\//, "src/").replace(/\.js$/, ".ts"));
    const loaded = loadOrNull(() =>
      fromRegistry && fs.existsSync(source)
        ? required(source)
        : loadOwnFile(path.join(dir, file), /^\.\/(core|hook\/useSharedValue)(\.js)?$/, NOT_LOADED),
    );
    for (const name of names) {
      if (typeof loaded?.[name] === "function") helpers[name] = loaded[name];
    }
  }
  return helpers;
}

type Handler = (event: any, context?: Record<string, unknown>) => void;
type ScrollHandlers = {
  onScroll?: Handler;
  onBeginDrag?: Handler;
  onEndDrag?: Handler;
  onMomentumBegin?: Handler;
  onMomentumEnd?: Handler;
};

/** A built scroll handler's handlers for the scroll view props other than `onScroll`. */
const SCROLL_EVENTS = Symbol.for("vitest-native.reanimated.scrollEvents");
const EVENT_PROPS: Record<string, keyof ScrollHandlers> = {
  onScrollBeginDrag: "onBeginDrag",
  onScrollEndDrag: "onEndDrag",
  onMomentumScrollBegin: "onMomentumBegin",
  onMomentumScrollEnd: "onMomentumEnd",
};

/** What `load` returns, or null when it throws: not this version's layout, or not loadable here. */
function loadOrNull(load: () => Record<string, any>): Record<string, any> | null {
  try {
    return load();
  } catch {
    return null;
  }
}

/**
 * A scroll view that, given a scroll handler as `onScroll`, also passes it the view's
 * drag and momentum events, as reanimated's animated scroll views do (they subscribe
 * a handler to every event it handles). A prop the test gives itself still runs.
 */
function withScrollEvents(Component: any): any {
  const Wrapped = React.forwardRef((props: any, ref: any) => {
    const events = props.onScroll?.[SCROLL_EVENTS] as Record<string, Fn> | undefined;
    if (!events) return React.createElement(Component, { ...props, ref });
    const extra: Record<string, Fn> = {};
    for (const [prop, run] of Object.entries(events)) {
      const own = props[prop];
      extra[prop] = (event: unknown) => {
        run(event);
        if (typeof own === "function") own(event);
      };
    }
    return React.createElement(Component, { ...props, ...extra, ref });
  });
  Wrapped.displayName = Component.displayName ?? Component.name ?? "ScrollView";
  return Wrapped;
}

/**
 * `useAnimatedScrollHandler`, `useComposedEventHandler` and `useScrollOffset` that work.
 * The scroll handler is one function for the life of the component, as reanimated's
 * handler is, and runs the handlers of the latest render. Passed as a scroll view's
 * `onScroll`, it gets each scroll event's payload (`nativeEvent`) and a context object
 * kept between events; a reanimated scroll view (withScrollEvents) passes it the drag
 * and momentum events too, as `onBeginDrag`, `onEndDrag`, `onMomentumBegin` and
 * `onMomentumEnd`. A composed handler passes each event to every handler it was given,
 * and so the drag and momentum events of the scroll handlers among them. The offset
 * hooks return a shared value (`useSharedValue(0)`, kept across renders).
 */
function scrollHandlers(useSharedValue?: Fn) {
  function useAnimatedScrollHandler(handlers: Handler | ScrollHandlers | undefined) {
    const latest = React.useRef<ScrollHandlers>({});
    latest.current = typeof handlers === "function" ? { onScroll: handlers } : (handlers ?? {});
    const built = React.useRef<any>(null);
    if (!built.current) {
      const context: Record<string, unknown> = {};
      const run = (name: keyof ScrollHandlers) => (event: any) =>
        latest.current[name]?.(event?.nativeEvent ?? event, context);
      const handler: any = run("onScroll");
      handler[SCROLL_EVENTS] = Object.fromEntries(
        Object.entries(EVENT_PROPS).map(([prop, name]) => [prop, run(name)]),
      );
      built.current = handler;
    }
    return built.current;
  }
  function useComposedEventHandler(handlers: unknown[] | null | undefined) {
    const list = (handlers ?? []).filter((h): h is Fn => typeof h === "function");
    const composed: any = (event: unknown) => {
      for (const handler of list) handler(event);
    };
    const events: Record<string, Fn> = {};
    for (const prop of Object.keys(EVENT_PROPS)) {
      const runs = list.map((h: any) => h[SCROLL_EVENTS]?.[prop]).filter(Boolean) as Fn[];
      if (runs.length > 0) events[prop] = (event) => runs.forEach((run) => run(event));
    }
    if (Object.keys(events).length > 0) composed[SCROLL_EVENTS] = events;
    return composed;
  }
  function useScrollOffset() {
    const value = useSharedValue ? useSharedValue(0) : undefined;
    return React.useRef(value).current;
  }
  return { useAnimatedScrollHandler, useComposedEventHandler, useScrollOffset };
}

/**
 * Resolve the *active* React Native module — the mock under `engine: 'mock'`
 * (intercepted by the CJS bridge) or real RN under `engine: 'native'` (served by
 * the Node loader hooks). Cached. Lets the reanimated mock's `Animated.View`
 * &co. wrap whichever RN component set is live, so the preset is engine-agnostic.
 */
let _rnCache: Record<string, any> | null = null;
function getRN(): Record<string, any> {
  if (_rnCache) return _rnCache;
  try {
    const base = path.join(workerRoot(), "package.json");
    _rnCache = createRequire(base)("react-native");
  } catch {
    _rnCache = {};
  }
  return _rnCache!;
}

export function reanimated(): Preset {
  return builtInPreset({
    name: "reanimated",
    modules: {
      "react-native-reanimated": libraryMockModule(REANIMATED_MOCK, {
        exports: [
          "useSharedValue",
          "useAnimatedStyle",
          "useAnimatedProps",
          "useDerivedValue",
          "useAnimatedScrollHandler",
          "useComposedEventHandler",
          "useScrollOffset",
          "useScrollViewOffset",
          "useAnimatedGestureHandler",
          "useAnimatedReaction",
          "useAnimatedKeyboard",
          "useReducedMotion",
          "useFrameCallback",
          "withTiming",
          "withSpring",
          "withDecay",
          "withSequence",
          "withDelay",
          "withRepeat",
          "runOnJS",
          "runOnUI",
          "createAnimatedComponent",
          "addWhitelistedUIProps",
          "addWhitelistedNativeProps",
          "configureProps",
          // View/Text/Image/ScrollView/FlatList are properties of the default
          // export (`Animated.View`), never named exports of the real package.
          "Easing",
          "FadeIn",
          "FadeOut",
          "FadeInDown",
          "FadeInUp",
          "FadeInLeft",
          "FadeInRight",
          "FadeOutDown",
          "FadeOutUp",
          "FadeOutLeft",
          "FadeOutRight",
          "SlideInRight",
          "SlideInLeft",
          "SlideInUp",
          "SlideInDown",
          "SlideOutRight",
          "SlideOutLeft",
          "SlideOutUp",
          "SlideOutDown",
          "ZoomIn",
          "ZoomOut",
          "BounceIn",
          "BounceOut",
          "BounceInDown",
          "BounceInUp",
          "BounceInLeft",
          "BounceInRight",
          "FlipInEasyX",
          "FlipInEasyY",
          "FlipOutEasyX",
          "FlipOutEasyY",
          "LightSpeedInLeft",
          "LightSpeedInRight",
          "LightSpeedOutLeft",
          "LightSpeedOutRight",
          "PinwheelIn",
          "PinwheelOut",
          "StretchInX",
          "StretchInY",
          "StretchOutX",
          "StretchOutY",
          "RotateInDownLeft",
          "RotateInDownRight",
          "RotateInUpLeft",
          "RotateInUpRight",
          "RotateOutDownLeft",
          "RotateOutDownRight",
          "RotateOutUpLeft",
          "RotateOutUpRight",
          "Layout",
          "LinearTransition",
          "SequencedTransition",
          "FadingTransition",
          "JumpingTransition",
          "CurvedTransition",
          "EntryExitTransition",
          "interpolate",
          "interpolateColor",
          "clamp",
          "Extrapolation",
          "isSharedValue",
          "useAnimatedRef",
          "measure",
          "scrollTo",
          "cancelAnimation",
          "makeMutable",
          "SharedTransition",
          "ReduceMotion",
          "KeyboardState",
        ],
        factory: () => {
          function createSharedValue(init: any) {
            const listeners = new Map<number, Function>();
            const sv = {
              // What reanimated's own isSharedValue checks for.
              _isReanimatedSharedValue: true,
              value: init,
              get() {
                return sv.value;
              },
              set(value: any) {
                sv.value = typeof value === "function" ? value(sv.value) : value;
                listeners.forEach((fn) => fn(sv.value));
              },
              addListener(id: number, listener: Function) {
                listeners.set(id, listener);
              },
              removeListener(id: number) {
                listeners.delete(id);
              },
              modify(modifier?: Function, forceUpdate?: boolean) {
                if (modifier) modifier(sv.value);
                if (forceUpdate !== false) listeners.forEach((fn) => fn(sv.value));
              },
            };
            return sv;
          }

          function useSharedValue(init: any) {
            const ref = React.useRef(createSharedValue(init));
            return ref.current;
          }

          function useAnimatedStyle(updater: () => any) {
            return updater();
          }

          function useAnimatedProps(updater: () => any) {
            return updater();
          }

          function useDerivedValue(updater: () => any) {
            return createSharedValue(updater());
          }

          const { useAnimatedScrollHandler, useComposedEventHandler, useScrollOffset } =
            scrollHandlers(createSharedValue);
          // Reanimated's own, from the installed package (ownHelpers). Where its file
          // does not load, `interpolate` keeps the stand-in it always had (the first
          // output value), and `clamp` and `interpolateColor` say why they fail.
          const installedDir = reanimatedDir(workerRoot());
          const helpers = installedDir ? ownHelpers(installedDir) : {};
          const unavailable = (name: string) => () => {
            throw new VitestNativeError(
              "PRESET_UNAVAILABLE",
              `reanimated's ${name} did not load from ${installedDir ?? "react-native-reanimated (not installed)"}. ` +
                (underNativeEngine()
                  ? "Its file is missing or failed to load; please report this with your reanimated version."
                  : "The mock engine runs no transform, and its file needs one (it imports React " +
                    "Native, or, before reanimated 4.5, modules without a file extension). It works " +
                    "under the native engine (engine: 'native')."),
            );
          };
          const interpolate = vi.fn(
            helpers.interpolate ??
              ((_value: number, _input: number[], output: number[]) => output[0]),
          );
          const interpolateColor = vi.fn(
            helpers.interpolateColor ?? unavailable("interpolateColor"),
          );
          const clamp = vi.fn(helpers.clamp ?? unavailable("clamp"));

          function useAnimatedGestureHandler(_handler: any) {
            return vi.fn();
          }

          function useAnimatedReaction(
            _prepare: () => any,
            _react: (prepared: any, previous: any) => void,
            _deps?: any[],
          ) {
            // No-op in tests — reaction doesn't fire
          }

          function useAnimatedKeyboard() {
            return {
              state: createSharedValue(0),
              height: createSharedValue(0),
            };
          }

          function useReducedMotion() {
            return false;
          }

          function useFrameCallback(_callback: (info: any) => void, _autostart?: boolean) {
            return {
              setActive: vi.fn(),
              isActive: false,
              callbackId: 0,
            };
          }

          function withTiming(toValue: any, _config?: any, callback?: any) {
            callback?.({ finished: true, current: toValue });
            return toValue;
          }

          function withSpring(toValue: any, _config?: any, callback?: any) {
            callback?.({ finished: true, current: toValue });
            return toValue;
          }

          function withDecay(_config?: any, callback?: any) {
            callback?.({ finished: true, current: 0 });
            return 0;
          }

          function withSequence(...values: any[]) {
            return values[values.length - 1];
          }

          function withDelay(_delay: number, value: any) {
            return value;
          }

          function withRepeat(value: any) {
            return value;
          }

          function runOnJS(fn: Function) {
            return fn;
          }

          function runOnUI(fn: Function) {
            return fn;
          }

          // Init-time no-ops some libraries (and reanimated's own setup) call on
          // the default export, e.g. `Reanimated.addWhitelistedUIProps(...)`.
          function addWhitelistedUIProps(_props?: any) {}
          function addWhitelistedNativeProps(_props?: any) {}
          function configureProps() {}

          function createAnimatedComponent(component: any) {
            const Animated = React.forwardRef((props: any, ref: any) => {
              return React.createElement(component, { ...props, ref });
            });
            Animated.displayName = `Animated(${component.displayName || component.name || "Component"})`;
            return Animated;
          }

          // Built-in animated components (Animated.View, Animated.Text, …). Each
          // lazily wraps the *active* RN component at render time so it renders
          // through the real RN host under the native engine, or the mock under
          // the mock engine. Resolving lazily (not at factory time) avoids
          // touching RN before the engine's hooks are installed.
          function makeAnimatedHost(name: string) {
            const Comp = React.forwardRef((props: any, ref: any) => {
              const Base = getRN()[name];
              if (!Base) {
                throw new VitestNativeError(
                  "PRESET_UNAVAILABLE",
                  `The reanimated preset needs React Native's '${name}' ` +
                    `component to build Animated.${name}, and react-native did not provide it.\n` +
                    `This usually means react-native resolved to something unexpected — a ` +
                    `partially installed copy, or a mock replacing the whole module. Check ` +
                    `that 'react-native' resolves in your project and that no vi.mock ` +
                    `replaces it wholesale.`,
                );
              }
              return React.createElement(Base, { ...props, ref });
            });
            Comp.displayName = `Animated.${name}`;
            return Comp;
          }

          const View = makeAnimatedHost("View");
          const Text = makeAnimatedHost("Text");
          const Image = makeAnimatedHost("Image");
          const ScrollView = withScrollEvents(makeAnimatedHost("ScrollView"));
          const FlatList = withScrollEvents(makeAnimatedHost("FlatList"));

          // Helper to create chainable layout animation presets. Each modifier is
          // `vi.fn(impl)`, not `.mockReturnValue()`: mockReset() (and `mockReset: true`)
          // keeps the first and drops the second, so a reset broke the chain.
          function createLayoutAnim() {
            const obj: any = {};
            obj.duration = vi.fn(() => obj);
            obj.delay = vi.fn(() => obj);
            obj.easing = vi.fn(() => obj);
            obj.damping = vi.fn(() => obj);
            obj.stiffness = vi.fn(() => obj);
            obj.mass = vi.fn(() => obj);
            obj.overshootClamping = vi.fn(() => obj);
            obj.restDisplacementThreshold = vi.fn(() => obj);
            obj.restSpeedThreshold = vi.fn(() => obj);
            obj.springify = vi.fn(() => obj);
            obj.withCallback = vi.fn(() => obj);
            obj.withInitialValues = vi.fn(() => obj);
            obj.randomDelay = vi.fn(() => obj);
            obj.build = vi.fn();
            return obj;
          }

          // `.mockReturnThis()` is dropped by mockReset() too; see createLayoutAnim.
          function returnThis(this: unknown) {
            return this;
          }

          return {
            default: {
              createAnimatedComponent,
              View,
              Text,
              Image,
              ScrollView,
              FlatList,
              addWhitelistedUIProps,
              addWhitelistedNativeProps,
              configureProps,
              // As on reanimated's own default export.
              interpolate,
              interpolateColor,
              clamp,
            },
            addWhitelistedUIProps,
            addWhitelistedNativeProps,
            configureProps,
            useSharedValue,
            useAnimatedStyle,
            useAnimatedProps,
            useDerivedValue,
            useAnimatedScrollHandler,
            useComposedEventHandler,
            useScrollOffset,
            useScrollViewOffset: useScrollOffset,
            useAnimatedGestureHandler,
            useAnimatedReaction,
            useAnimatedKeyboard,
            useReducedMotion,
            useFrameCallback,
            withTiming,
            withSpring,
            withDecay,
            withSequence,
            withDelay,
            withRepeat,
            runOnJS,
            runOnUI,
            createAnimatedComponent,
            Easing: {
              linear: vi.fn((t: number) => t),
              ease: vi.fn((t: number) => t),
              quad: vi.fn((t: number) => t * t),
              cubic: vi.fn((t: number) => t * t * t),
              bezier: vi.fn(() => (t: number) => t),
              in: vi.fn((fn: Function) => fn),
              out: vi.fn((fn: Function) => fn),
              inOut: vi.fn((fn: Function) => fn),
            },
            // Entering animations
            FadeIn: createLayoutAnim(),
            FadeOut: createLayoutAnim(),
            FadeInDown: createLayoutAnim(),
            FadeInUp: createLayoutAnim(),
            FadeInLeft: createLayoutAnim(),
            FadeInRight: createLayoutAnim(),
            FadeOutDown: createLayoutAnim(),
            FadeOutUp: createLayoutAnim(),
            FadeOutLeft: createLayoutAnim(),
            FadeOutRight: createLayoutAnim(),
            SlideInRight: createLayoutAnim(),
            SlideInLeft: createLayoutAnim(),
            SlideInUp: createLayoutAnim(),
            SlideInDown: createLayoutAnim(),
            SlideOutRight: createLayoutAnim(),
            SlideOutLeft: createLayoutAnim(),
            SlideOutUp: createLayoutAnim(),
            SlideOutDown: createLayoutAnim(),
            ZoomIn: createLayoutAnim(),
            ZoomOut: createLayoutAnim(),
            BounceIn: createLayoutAnim(),
            BounceOut: createLayoutAnim(),
            BounceInDown: createLayoutAnim(),
            BounceInUp: createLayoutAnim(),
            BounceInLeft: createLayoutAnim(),
            BounceInRight: createLayoutAnim(),
            FlipInEasyX: createLayoutAnim(),
            FlipInEasyY: createLayoutAnim(),
            FlipOutEasyX: createLayoutAnim(),
            FlipOutEasyY: createLayoutAnim(),
            LightSpeedInLeft: createLayoutAnim(),
            LightSpeedInRight: createLayoutAnim(),
            LightSpeedOutLeft: createLayoutAnim(),
            LightSpeedOutRight: createLayoutAnim(),
            PinwheelIn: createLayoutAnim(),
            PinwheelOut: createLayoutAnim(),
            StretchInX: createLayoutAnim(),
            StretchInY: createLayoutAnim(),
            StretchOutX: createLayoutAnim(),
            StretchOutY: createLayoutAnim(),
            RotateInDownLeft: createLayoutAnim(),
            RotateInDownRight: createLayoutAnim(),
            RotateInUpLeft: createLayoutAnim(),
            RotateInUpRight: createLayoutAnim(),
            RotateOutDownLeft: createLayoutAnim(),
            RotateOutDownRight: createLayoutAnim(),
            RotateOutUpLeft: createLayoutAnim(),
            RotateOutUpRight: createLayoutAnim(),
            // Layout transitions
            Layout: createLayoutAnim(),
            LinearTransition: createLayoutAnim(),
            SequencedTransition: createLayoutAnim(),
            FadingTransition: createLayoutAnim(),
            JumpingTransition: createLayoutAnim(),
            CurvedTransition: createLayoutAnim(),
            EntryExitTransition: createLayoutAnim(),
            interpolate,
            interpolateColor,
            clamp,
            Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
            // As reanimated's own: what its shared values (createSharedValue above) carry.
            isSharedValue: (value: any) => value?._isReanimatedSharedValue === true,
            useAnimatedRef: () => React.useRef(null),
            measure: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0, pageX: 0, pageY: 0 })),
            scrollTo: vi.fn(),
            cancelAnimation: vi.fn(),
            makeMutable: vi.fn((init: any) => createSharedValue(init)),
            SharedTransition: {
              duration: vi.fn(returnThis),
              custom: vi.fn(returnThis),
              progressAnimation: vi.fn(returnThis),
              defaultTransitionType: vi.fn(returnThis),
            },
            ReduceMotion: { System: "system", Always: "always", Never: "never" },
            KeyboardState: { UNKNOWN: 0, OPENING: 1, OPEN: 2, CLOSING: 3, CLOSED: 4 },
          };
        },
      }),
    },
  });
}
