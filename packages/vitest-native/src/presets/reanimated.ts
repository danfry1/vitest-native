import fs from "node:fs";
import type { Preset } from "../types.js";
import { vi } from "vitest";
import { hosts } from "../mocks/host-classes.js";
import { createRequire, Module } from "node:module";
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
  // their handlers; and what its value hooks give lacks Reanimated 4's shared value shape
  // (no modify() or listeners, which Gesture Handler 3 adds to one given as gesture
  // config; `{ value: 0 }` from the offsets and the timestamp; numbers for the keyboard).
  // Those names, and only while the mock's value still behaves so (mockCorrections), are
  // replaced: the helpers by reanimated's own (ownHelpers), the rest by ones that work
  // (scrollHandlers, sharedValue). A reanimated whose mock does better keeps its own.
  // Under the native engine, beside the mock its library registry serves.
  extend: (mock, dir, { React }) => mockCorrections(React, mock, dir, true),
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

/** The methods a Reanimated 4 shared value has, besides `value`. */
const SHARED_VALUE_METHODS = ["get", "set", "modify", "addListener", "removeListener"] as const;

/**
 * Whether `value` has Reanimated 4's shared value shape: the `_isReanimatedSharedValue`
 * mark its `isSharedValue()` checks (Gesture Handler 3 checks it on gesture config), a
 * `value`, and get/set/modify/addListener/removeListener.
 */
export function isSharedValueShaped(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const shared = value as Record<string, unknown>;
  return (
    shared._isReanimatedSharedValue === true &&
    "value" in shared &&
    SHARED_VALUE_METHODS.every((name) => typeof shared[name] === "function")
  );
}

/** What a probe answers when the call throws: a hook that needs a render, taken as working. */
const NEEDS_RENDER = Symbol("needs a render");

/** What `call` returns outside a render, or NEEDS_RENDER when it throws. */
function probeHook(call: () => unknown): unknown {
  return quietly(() => {
    try {
      return call();
    } catch {
      return NEEDS_RENDER;
    }
  });
}

/**
 * A shared value with Reanimated 4's API: `.value` and `get()`, `set(value | updater)`,
 * `modify(modifier?, forceUpdate = true)` (the value becomes the modifier's result),
 * `addListener(id, listener)` / `removeListener(id)`, each listener called with the new
 * value on every write, and the `_isReanimatedSharedValue` mark. A read (`.value` or
 * `get()`) is recorded while a derived value's updater runs (derivedValue).
 */
export function sharedValue<T>(init: T) {
  let current = init;
  const listeners = new Map<unknown, (value: T) => void>();
  const notify = () => {
    // A snapshot: a listener that re-subscribes (derivedValue) is not called again.
    for (const listener of Array.from(listeners.values())) listener(current);
  };
  const shared = {
    _isReanimatedSharedValue: true as const,
    get value(): T {
      derivedReads?.add(shared);
      return current;
    },
    set value(next: T) {
      current = next;
      notify();
    },
    get: (): T => {
      derivedReads?.add(shared);
      return current;
    },
    set(next: T | ((value: T) => T)) {
      current = typeof next === "function" ? (next as (value: T) => T)(current) : next;
      notify();
    },
    modify(modifier?: (value: T) => T, forceUpdate = true) {
      if (modifier) current = modifier(current);
      if (forceUpdate !== false) notify();
    },
    addListener(id: unknown, listener: (value: T) => void) {
      listeners.set(id, listener);
    },
    removeListener(id: unknown) {
      listeners.delete(id);
    },
  };
  return shared;
}

type SharedValue = ReturnType<typeof sharedValue<unknown>>;

/** The shared values read while a derived value's updater runs, or null outside one. */
let derivedReads: Set<SharedValue> | null = null;

/**
 * Reanimated's useDerivedValue: a shared value holding what `updater` returns, recomputed
 * whenever a shared value the updater read changes, without a render. Reanimated starts a
 * mapper over the updater's inputs and runs it on every change of one (at once under
 * Jest, src/mappers.ts maybeRequestUpdates); here the inputs are the shared values the
 * last run read, so it needs no Babel plugin. It also recomputes on every render, as the
 * mock's does, so a value the updater takes from props is current, and once more on
 * mount, as Reanimated's mapper runs when it starts. Listeners hear a changed result, and
 * the subscriptions end when the component unmounts.
 */
export function derivedValue(React: typeof import("react"), updater: () => unknown): SharedValue {
  // Outside a render, which the mock allows, a new one each call, with no component to
  // unmount; in one, kept per component (perComponent).
  const rendering = useRefOrNull<DerivedState>(React);
  const state = rendering?.current ?? derivedState(updater);
  if (rendering && rendering.current === null) rendering.current = state;
  state.updater = updater;
  state.run();
  if (rendering) {
    // Subscribed again on mount, as Reanimated starts its mapper in an effect (a
    // StrictMode remount stops it first).
    React.useEffect(() => {
      state.run();
      return () => state.stop();
    }, [state]);
  }
  return state.derived;
}

type DerivedState = ReturnType<typeof derivedState>;

function derivedState(updater: () => unknown) {
  const held = {
    derived: sharedValue<unknown>(undefined),
    updater,
    inputs: new Set<SharedValue>(),
    ran: false,
    last: undefined as unknown,
    run() {
      const outer = derivedReads;
      const read = new Set<SharedValue>();
      derivedReads = read;
      let next: unknown;
      try {
        next = held.updater();
      } finally {
        derivedReads = outer;
      }
      read.delete(held.derived);
      for (const input of held.inputs) if (!read.has(input)) input.removeListener(held);
      for (const input of read) if (!held.inputs.has(input)) input.addListener(held, held.run);
      held.inputs = read;
      if (!held.ran || !Object.is(held.last, next)) {
        held.ran = true;
        held.last = next;
        held.derived.value = next;
      }
    },
    stop() {
      for (const input of held.inputs) input.removeListener(held);
      held.inputs.clear();
    },
  };
  return held;
}

/**
 * `create()` once per component, as Reanimated's hooks keep their shared values: a
 * listener added on one render (Gesture Handler's, on a gesture's `enabled`) hears a
 * write made through a later render's value. Outside a render, which the mock allows, a
 * new one each call.
 */
function perComponent<T>(React: typeof import("react"), create: () => T): T {
  const held = useRefOrNull<T>(React);
  if (held === null) return create();
  if (held.current === null) held.current = create();
  return held.current;
}

/**
 * Reanimated's mock, with the names it answers with a no-op replaced (see
 * REANIMATED_MOCK). Exported for its tests.
 */
export function mockCorrections(
  React: typeof import("react"),
  mock: Record<string, any>,
  dir: string,
  fromRegistry = false,
  helpers: Helpers = ownHelpers(dir, fromRegistry),
  real: Record<string, any> | null = ownIndex(dir, fromRegistry),
): Record<string, any> {
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
  const handlers = scrollHandlers(React, mock.useSharedValue);
  const fixed: Record<string, any> = { ...fixHelpers(mock) };
  const scrollFixed = neverCalls((h) => mock.useAnimatedScrollHandler?.({ onScroll: h }));
  if (scrollFixed) fixed.useAnimatedScrollHandler = handlers.useAnimatedScrollHandler;
  // Probed with a plain function. Reanimated composes the handlers its own hooks build
  // (workletEventHandler); a mock that composed only those would read as a no-op here and
  // be replaced by one that also runs plain functions, which is a superset.
  if (neverCalls((h) => mock.useComposedEventHandler?.([h]))) {
    fixed.useComposedEventHandler = handlers.useComposedEventHandler;
  }
  // Every hook that gives a shared value, and makeMutable: probed outside a render (the
  // mock's hooks need none) and replaced only while what it gives lacks Reanimated 4's
  // shape (isSharedValueShaped). 4.7.1's mock gives shared values without modify() or
  // listeners, a derived value without the mark, `{ value: 0 }` for the offsets and the
  // timestamp, plain numbers for the keyboard, a sensor without get(), and makeMutable's
  // argument itself (#351: "first.get is not a function").
  const gives = (name: string, call: (hook: Fn) => unknown) => {
    const hook = mock[name];
    return typeof hook === "function" ? probeHook(() => call(hook)) : undefined;
  };
  const wrong = (name: string, call: (hook: Fn) => unknown) => {
    if (typeof mock[name] !== "function") return false;
    const given = gives(name, call);
    return given !== NEEDS_RENDER && !isSharedValueShaped(given);
  };
  if (wrong("useSharedValue", (hook) => hook(0))) {
    fixed.useSharedValue = (init: unknown) => perComponent(React, () => sharedValue(init));
  }
  if (wrong("makeMutable", (hook) => hook(0))) {
    fixed.makeMutable = (init: unknown) => sharedValue(init);
  }
  if (wrong("useDerivedValue", (hook) => hook(() => 0))) {
    fixed.useDerivedValue = (updater: () => unknown) => derivedValue(React, updater);
  }
  for (const name of ["useScrollOffset", "useScrollViewOffset", "useTimestamp"]) {
    if (wrong(name, (hook) => hook())) {
      fixed[name] = () => perComponent(React, () => sharedValue(0));
    }
  }
  const keyboard = gives("useAnimatedKeyboard", (hook) => hook()) as Record<string, unknown>;
  if (
    typeof mock.useAnimatedKeyboard === "function" &&
    (keyboard as unknown) !== NEEDS_RENDER &&
    !(isSharedValueShaped(keyboard?.height) && isSharedValueShaped(keyboard?.state))
  ) {
    const own = mock.useAnimatedKeyboard as Fn;
    // height 0 and state 0 (KeyboardState.UNKNOWN), as the mock's numbers are.
    fixed.useAnimatedKeyboard = (...args: unknown[]) =>
      perComponent(React, () => ({
        ...own(...args),
        height: sharedValue(0),
        state: sharedValue(0),
      }));
  }
  const sensor = gives("useAnimatedSensor", (hook) => hook(0)) as Record<string, unknown>;
  if (
    typeof mock.useAnimatedSensor === "function" &&
    (sensor as unknown) !== NEEDS_RENDER &&
    !isSharedValueShaped(sensor?.sensor)
  ) {
    const own = mock.useAnimatedSensor as Fn;
    // The mock's own reading (x, y, z, interfaceOrientation …), as the value.
    fixed.useAnimatedSensor = (...args: unknown[]) =>
      perComponent(React, () => {
        const given = own(...args) ?? {};
        const reading = given.sensor?.value ?? given.sensor;
        return { ...given, sensor: sharedValue(reading) };
      });
  }
  // Layout animations and Keyframe: the mock gives one shared object per builder, with
  // its methods returning itself, so `new FadeIn()`, `instanceof FadeIn` and a class that
  // extends a builder fail. Reanimated's own classes, from the index the mock itself
  // imports, wherever a real export is a builder class (BaseAnimationBuilder or a class
  // that extends it; Keyframe by name) and the mock serves something else (#696).
  if (real) {
    const base = real.BaseAnimationBuilder;
    for (const [name, own] of Object.entries(real)) {
      const builder =
        typeof own === "function" &&
        (own === base ||
          (typeof base === "function" && own.prototype instanceof base) ||
          name === "Keyframe");
      if (builder && name in mock && mock[name] !== own) fixed[name] = own;
    }
  }
  // useAnimatedRef: the mock's is `{ current }`; Reanimated's is a function ref (React
  // calls it with the node, and with null on unmount) with `current`, `observe` and
  // `getTag`, kept per component (#696).
  if (
    typeof mock.useAnimatedRef === "function" &&
    typeof gives("useAnimatedRef", (hook) => hook()) === "object"
  ) {
    fixed.useAnimatedRef = () =>
      perComponent(React, () => {
        const ref: any = (node?: unknown) => {
          if (node !== undefined) ref.current = node;
          return ref.current;
        };
        ref.current = null;
        ref.observe = () => () => {};
        ref.getTag = () => null;
        return ref;
      });
  }
  // Worklet runtimes, while the mock's are no-ops: createWorkletRuntime gives a runtime
  // (its name and an id, as Reanimated's WorkletRuntime has), and runOnRuntime gives the
  // function to call, which runs the worklet, as the mock's runOnUI does (#696).
  const runtime = gives("createWorkletRuntime", (hook) => hook({ name: "probe" })) as any;
  if (typeof mock.createWorkletRuntime === "function" && typeof runtime?.runtimeId !== "number") {
    let next = 1;
    fixed.createWorkletRuntime = (config?: string | { name?: string }) => ({
      name: (typeof config === "string" ? config : config?.name) ?? "",
      runtimeId: next++,
    });
  }
  if (
    typeof mock.runOnRuntime === "function" &&
    typeof gives("runOnRuntime", (hook) => hook({}, () => {})) !== "function"
  ) {
    fixed.runOnRuntime =
      (_runtime: unknown, worklet: Fn) =>
      (...args: unknown[]) =>
        worklet(...args);
  }
  // Reanimated's setUpTests() registers its own toHaveAnimatedStyle and
  // toHaveAnimatedProps on the global `expect` (or on Jest's `expect` package when there
  // is none). Theirs read props only Reanimated's real components set, which this mock's
  // components do not, so after the call every animated-style assertion failed. The engine
  // registers working equivalents itself. setUpTests() still runs, for the frame time it
  // sets for advanceAnimationByFrame, but against an `expect` whose extend does nothing.
  if (typeof mock.setUpTests === "function") {
    const own = mock.setUpTests as Fn;
    fixed.setUpTests = (...args: unknown[]) => {
      const global = globalThis as Record<string, unknown>;
      const had = Object.prototype.hasOwnProperty.call(global, "expect");
      const previous = global.expect;
      global.expect = { extend() {} };
      try {
        return own(...args);
      } finally {
        if (had) global.expect = previous;
        else delete global.expect;
      }
    };
  }
  const defaults: Record<string, any> = { ...mock.default, ...fixHelpers(mock.default) };
  // The scroll views pass a handler's drag and momentum handlers on (withScrollEvents).
  if (scrollFixed) {
    for (const name of ["ScrollView", "FlatList"]) {
      if (defaults[name]) defaults[name] = withScrollEvents(React, defaults[name]);
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
    const own = () =>
      loadOwnFile(path.join(dir, file), /^\.\/(core|hook\/useSharedValue)(\.js)?$/, NOT_LOADED);
    // Only a file the registry holds: required by path otherwise, it would load a second
    // copy of reanimated's source through Node.
    const loaded =
      (fromRegistry && registryHolds(source) ? loadOrNull(() => required(source)) : null) ??
      loadOrNull(own);
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

/**
 * React's error for a hook called outside a render: "Invalid hook call. …" from a
 * development build, error #321 from a production one. Thrown by the dispatcher a renderer
 * leaves in place after its first render. Checked against React 19.3.1 with
 * react-reconciler 0.34.0 (throwInvalidHookError, both builds), the versions this
 * repository installs; the phrase is the one React has used for this error since hooks
 * shipped. A React that throws something else here fails loudly rather than silently.
 */
const INVALID_HOOK_CALL = /^(?:Invalid hook call\.|Minified React error #321[;:])/;

/**
 * React's `useRef` in a render, or null outside one (where hooks cannot run). Reanimated's
 * own mock gives shared values outside a render, so its corrected hooks do too (#747).
 * React gives no public way to ask whether a render is in progress, so outside one is
 * recognised by what React does there, and anything else propagates:
 * - before any renderer has rendered, React's hook dispatcher is null and `useRef` would
 *   log "Invalid hook call" and then fail reading null; the dispatcher is read instead
 *   (React 19's client internals, as resident-health.mjs reads its act queue);
 * - afterwards, `useRef` throws React's invalid-hook-call error (INVALID_HOOK_CALL).
 * The trade-off: React throws that same error for a genuine rules-of-hooks bug (a hook in
 * a class component's render, inside an effect or event handler, or after another copy
 * of React rendered), so such a call also gets a fresh value here where real Reanimated
 * would throw. That matches the library's own mock, which answers any call outside a
 * render. A second copy of React that never renders keeps its dispatcher null, which
 * reads as "before any render"; the factory's context check (preset-react.mjs) rules
 * that copy out, as it fails when the file's React is not the renderer's.
 */
function useRefOrNull<T>(React: typeof import("react")): { current: T | null } | null {
  // Only an explicit null dispatcher means "before any render". Where React has no such
  // internals object or field (a future React renaming them), this falls through to the
  // narrowed catch below, never to null inside a render; the installed React's fields are
  // checked by name in tests/reanimated-mock-corrections.test.ts.
  const internals = (React as Record<string, any>)
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (
    internals != null &&
    typeof internals === "object" &&
    "H" in internals &&
    internals.H === null
  ) {
    return null;
  }
  try {
    return React.useRef<T | null>(null);
  } catch (error) {
    if (error instanceof Error && INVALID_HOOK_CALL.test(error.message)) return null;
    throw error;
  }
}

/** Whether the library registry holds `file` (native/registry.mjs, through the dispatcher). */
function registryHolds(file: string): boolean {
  const dispatch = (globalThis as Record<symbol, any>)[Symbol.for("vitest-native.node-dispatch")];
  return dispatch?.channel("registry").libraryHolds?.(file) === true;
}

/**
 * Reanimated's own index, which its mock imports (`from './index'`): the module the mock
 * loaded, from the library registry that holds it beside the mock, or from Node's cache
 * where the index loaded through Node (per-file module loading). Never a second copy:
 * null where neither holds it (unit tests), and the corrections that need it stay off.
 */
function ownIndex(dir: string, fromRegistry: boolean): Record<string, any> | null {
  if (!fromRegistry) return null;
  const index = path.join(dir, "src/index.ts");
  const required = createRequire(path.join(dir, "package.json"));
  // Without the library registry (per-file module loading), Node loaded the index for
  // the mock already: its cached module, under Node's real-path spelling, is the same one.
  const real = loadOrNull(() => ({ path: fs.realpathSync(index) }))?.path ?? index;
  if (!registryHolds(index) && !required.cache[real] && !required.cache[index]) return null;
  return loadOrNull(() => required(index));
}

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
function withScrollEvents(React: typeof import("react"), Component: any): any {
  const { asHost } = hosts(React);
  const Wrapped = React.forwardRef((props: any, ref: any) => {
    const events = props.onScroll?.[SCROLL_EVENTS] as Record<string, Fn> | undefined;
    if (!events) return React.createElement(asHost(Component), { ...props, ref });
    const extra: Record<string, Fn> = {};
    for (const [prop, run] of Object.entries(events)) {
      const own = props[prop];
      extra[prop] = (event: unknown) => {
        run(event);
        if (typeof own === "function") own(event);
      };
    }
    return React.createElement(asHost(Component), { ...props, ...extra, ref });
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
function scrollHandlers(React: typeof import("react"), useSharedValue?: Fn) {
  function useAnimatedScrollHandler(handlers: Handler | ScrollHandlers | undefined) {
    const latest = React.useRef<ScrollHandlers>({});
    latest.current = typeof handlers === "function" ? { onScroll: handlers } : (handlers ?? {});
    const built = React.useRef<any>(null);
    if (!built.current) {
      const context: Record<string, unknown> = {};
      const run = (name: keyof ScrollHandlers) => (event: any) =>
        latest.current[name]?.(event?.nativeEvent ?? event, context);
      // A spy, as the preset's handler was before it ran handlers, whose implementation
      // (vi.fn(impl)) survives a reset.
      const handler: any = vi.fn(run("onScroll"));
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
 * the Node loader hooks). Lets the reanimated mock's `Animated.View` &co. wrap whichever
 * RN component set is live, so the preset is engine-agnostic. Required on each call, a
 * module-cache hit: a copy kept for the worker would be the first file's components,
 * built with its React (freshRuntime, #719).
 */
function getRN(): Record<string, any> {
  try {
    return createRequire(path.join(workerRoot(), "package.json"))("react-native");
  } catch {
    return {};
  }
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
          "useTimestamp",
          "useAnimatedGestureHandler",
          "useAnimatedReaction",
          "useAnimatedKeyboard",
          "useAnimatedSensor",
          "useReducedMotion",
          "useFrameCallback",
          "useEvent",
          "useHandler",
          "setGestureState",
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
        factory: ({ React }) => {
          const { asHost } = hosts(React);
          // Reanimated 4's shared value shape (sharedValue above), as the corrections give.
          const createSharedValue = (init: any) => sharedValue(init);

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

          const useDerivedValue = (updater: () => any) => derivedValue(React, updater);

          const { useAnimatedScrollHandler, useComposedEventHandler, useScrollOffset } =
            scrollHandlers(React, createSharedValue);
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

          // A sensor that never moves: Reanimated's mock gives the same reading.
          function useAnimatedSensor(sensorType: number, config?: unknown) {
            const sensor = React.useRef(
              createSharedValue({ x: 0, y: 0, z: 0, interfaceOrientation: 0 }),
            ).current;
            return {
              sensor,
              unregister: () => {},
              isAvailable: false,
              config: config ?? {},
              sensorType,
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

          // As reanimated's own mock answers them. Gesture Handler, which runs as itself
          // under the native engine, builds its Reanimated integration on these: an event
          // handler that never fires, a handler context, and gesture state set from a
          // worklet (it would assign its own fallback onto this module otherwise).
          function useEvent(_handler: unknown, _eventNames?: string[], _rebuild?: boolean) {
            return () => {};
          }
          function useHandler() {
            return { context: {}, doDependenciesDiffer: false, useWeb: false };
          }
          function setGestureState(_handlerTag: number, _newState: number) {}

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
              return React.createElement(asHost(component), { ...props, ref });
            });
            Animated.displayName = `Animated(${component.displayName || component.name || "Component"})`;
            return Animated;
          }

          // Built-in animated components (Animated.View, Animated.Text, …). Each
          // lazily wraps the *active* RN component at render time so it renders
          // through the real RN host under the native engine, or the mock under
          // the mock engine. Resolving lazily (not at factory time) avoids
          // touching RN before the engine's hooks are installed. Kept for this file's
          // mock once found, as this file's React Native.
          let activeRN: Record<string, any> | undefined;
          const rn = () => {
            if (activeRN) return activeRN;
            const found = getRN();
            if (Object.keys(found).length > 0) activeRN = found;
            return found;
          };
          function makeAnimatedHost(name: string) {
            const Comp = React.forwardRef((props: any, ref: any) => {
              const Base = rn()[name];
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
              return React.createElement(asHost(Base), { ...props, ref });
            });
            Comp.displayName = `Animated.${name}`;
            return Comp;
          }

          const View = makeAnimatedHost("View");
          const Text = makeAnimatedHost("Text");
          const Image = makeAnimatedHost("Image");
          const ScrollView = withScrollEvents(React, makeAnimatedHost("ScrollView"));
          const FlatList = withScrollEvents(React, makeAnimatedHost("FlatList"));

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
            // A shared value that stays 0: no frames advance in a test.
            useTimestamp: useScrollOffset,
            useAnimatedGestureHandler,
            useAnimatedReaction,
            useAnimatedKeyboard,
            useAnimatedSensor,
            useReducedMotion,
            useFrameCallback,
            useEvent,
            useHandler,
            setGestureState,
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
