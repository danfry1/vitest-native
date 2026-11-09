import type { Mock } from "vitest";

// ─── React Native Mock Shape ─────────────────────────────────────────────────

/** Static methods available on the Image component mock. */
export interface ImageStatic {
  getSize: Mock;
  getSizeWithHeaders: Mock;
  prefetch: Mock;
  queryCache: Mock;
  resolveAssetSource: Mock;
}

/** The Animated API mock shape. */
export interface AnimatedMock {
  Value: new (value?: number) => any;
  ValueXY: new (value?: { x: number; y: number }) => any;
  Color: new () => any;
  timing: Mock;
  spring: Mock;
  decay: Mock;
  sequence: Mock;
  parallel: Mock;
  stagger: Mock;
  loop: Mock;
  delay: Mock;
  add: Mock;
  subtract: Mock;
  multiply: Mock;
  divide: Mock;
  modulo: Mock;
  diffClamp: Mock;
  event: Mock;
  forkEvent: Mock;
  unforkEvent: Mock;
  createAnimatedComponent: Mock;
  View: React.ComponentType<any>;
  Text: React.ComponentType<any>;
  Image: React.ComponentType<any>;
  ScrollView: React.ComponentType<any>;
  FlatList: React.ComponentType<any>;
  SectionList: React.ComponentType<any>;
}

/** Platform API mock shape. */
export interface PlatformMock {
  OS: "ios" | "android";
  Version: string | number;
  isPad: boolean;
  isTVOS: boolean;
  isTV: boolean;
  isVision: boolean;
  isTesting: boolean;
  select: Mock;
  constants: {
    reactNativeVersion: { major: number; minor: number; patch: number };
    osVersion: number;
    systemName: string;
    isTesting: boolean;
  };
}

/** Dimensions API mock shape. */
export interface DimensionsMock {
  get: Mock;
  set: Mock;
  addEventListener: Mock;
  _reset: () => void;
}

/** Keyboard API mock shape. */
export interface KeyboardMock {
  dismiss: Mock;
  addListener: Mock;
  removeListener: Mock;
  removeAllListeners: Mock;
  isVisible: Mock;
  metrics: Mock;
  scheduleLayoutAnimation: Mock;
  _show: (height?: number) => void;
  _hide: () => void;
  _reset: () => void;
}

/** AppState API mock shape. */
export interface AppStateMock {
  currentState: string;
  isAvailable: boolean;
  addEventListener: Mock;
  _setState: (state: string) => void;
  _reset: () => void;
}

/** The full React Native mock object. */
export interface ReactNativeMock {
  // Components
  View: React.ComponentType<any>;
  Text: React.ComponentType<any>;
  Image: React.ComponentType<any> & ImageStatic;
  TextInput: React.ComponentType<any>;
  ScrollView: React.ComponentType<any>;
  FlatList: React.ComponentType<any>;
  SectionList: React.ComponentType<any>;
  Modal: React.ComponentType<any>;
  Pressable: React.ComponentType<any>;
  TouchableOpacity: React.ComponentType<any>;
  TouchableHighlight: React.ComponentType<any>;
  TouchableWithoutFeedback: React.ComponentType<any>;
  TouchableNativeFeedback: React.ComponentType<any>;
  ActivityIndicator: React.ComponentType<any>;
  Button: React.ComponentType<any>;
  Switch: React.ComponentType<any>;
  RefreshControl: React.ComponentType<any>;
  StatusBar: Record<string, any>;
  SafeAreaView: React.ComponentType<any>;
  KeyboardAvoidingView: React.ComponentType<any>;
  ImageBackground: React.ComponentType<any>;
  VirtualizedList: React.ComponentType<any>;
  InputAccessoryView: React.ComponentType<any>;
  DrawerLayoutAndroid: React.ComponentType<any>;

  // APIs
  Platform: PlatformMock;
  Dimensions: DimensionsMock;
  StyleSheet: Record<string, any>;
  Animated: AnimatedMock;
  Alert: Record<string, Mock>;
  Linking: Record<string, Mock>;
  AppState: AppStateMock;
  Keyboard: KeyboardMock;
  BackHandler: Record<string, any>;
  Vibration: Record<string, Mock>;
  PermissionsAndroid: Record<string, any>;
  Appearance: Record<string, any>;
  PixelRatio: Record<string, Mock>;
  LayoutAnimation: Record<string, any>;
  Clipboard: Record<string, any>;
  Share: Record<string, Mock>;
  AccessibilityInfo: Record<string, Mock>;
  InteractionManager: Record<string, any>;
  PanResponder: Record<string, Mock>;
  ToastAndroid: Record<string, any>;
  ActionSheetIOS: Record<string, Mock>;
  LogBox: Record<string, Mock>;
  Easing: Record<string, Mock>;
  I18nManager: Record<string, any>;
  DeviceEventEmitter: Record<string, any>;
  useColorScheme: (() => "light" | "dark") & {
    _setScheme: (s: "light" | "dark") => void;
    _resetScheme: (s: "light" | "dark") => void;
  };
  useWindowDimensions: (() => {
    width: number;
    height: number;
    scale: number;
    fontScale: number;
  }) & { _setDimensions: (d: any) => void; _resetDimensions: (d: any) => void };

  // Native
  NativeModules: Record<string, any>;
  TurboModuleRegistry: Record<string, any>;
  UIManager: Record<string, any>;
  NativeEventEmitter: new (...args: any[]) => any;
  NativeAppEventEmitter: Record<string, any>;
  EventEmitter: new (...args: any[]) => any;
  NativeComponentRegistry: Record<string, any>;
  requireNativeComponent: Mock;

  // Additional exports
  AppRegistry: Record<string, Mock>;
  VirtualizedSectionList: React.ComponentType<any>;
  Touchable: Record<string, any>;
  processColor: Mock;
  findNodeHandle: Mock;
  PlatformColor: Mock;
  DynamicColorIOS: Mock;
  Settings: Record<string, Mock>;
  DeviceInfo: Record<string, any>;
  useAnimatedValue: Mock;
  useAnimatedValueXY: Mock;
  useAnimatedColor: Mock;
  RootTagContext: React.Context<any>;
  ReactNativeVersion: { major: number; minor: number; patch: number };
  Systrace: Record<string, Mock>;
  DevSettings: Record<string, Mock>;
  Networking: Record<string, Mock>;
  unstable_batchedUpdates: Mock;
  registerCallableModule: Mock;
  codegenNativeCommands: Mock;
  codegenNativeComponent: Mock;
  UTFSequence: Record<string, string>;
  ProgressBarAndroid: React.ComponentType<any>;
  PushNotificationIOS: Record<string, Mock>;
  NativeDialogManagerAndroid: Record<string, Mock>;
  usePressability: Mock;
  default: ReactNativeMock;
}

// ─── Plugin Types ────────────────────────────────────────────────────────────

export interface PresetModule {
  /** Factory that builds the mock object. Only called in Vitest worker processes. */
  factory: () => Record<string, any>;
  /** Static list of named exports for virtual ESM module generation. Read at Vite config time (no vitest available). */
  exports: string[];
  /**
   * Named exports read from the installed package, for a package whose API changes
   * between releases; replaces `exports` when present. Called once at Vite config time
   * with the project root, platform and engine. `null` means the package is not
   * installed, so the module is not shadowed at all.
   */
  exportsFor?: (context: {
    projectRoot: string;
    platform: "ios" | "android";
    engine: "mock" | "native";
  }) => string[] | null;
}

export interface Preset {
  name: string;
  modules: Record<string, PresetModule>;
  /**
   * Optional async work the setup file awaits before each test file, ahead of any
   * `factory`. For a mock that needs something only an async API provides: the skia
   * preset loads CanvasKit (Skia's WebAssembly build) here.
   */
  prepare?: () => Promise<void>;
  /**
   * Optional JSON-serializable configuration for the preset. Presets are rebuilt
   * inside Vitest worker processes from their `name`, so any options passed to a
   * preset factory (e.g. `navigation({ defaultRouteParams })`) must be carried
   * here to survive the main-process → worker boundary. Read by the native setup
   * file and passed back into the factory in-worker. Must be JSON-serializable.
   */
  config?: Record<string, unknown>;
}

/** Options for the `navigation` preset. */
export interface NavigationPresetOptions {
  /**
   * Params returned by the mocked `useRoute().params` (and used as a `<Screen>`'s
   * fallback `initialParams`). Lets you test components that read route params at
   * mount — e.g. `useRoute().params.id` — without a custom `vi.mock`. Must be
   * JSON-serializable (it crosses the worker boundary).
   *
   * @example
   * ```ts
   * presets.navigation({ defaultRouteParams: { id: '1', mode: 'edit' } })
   * ```
   */
  defaultRouteParams?: Record<string, unknown>;
}

/** The `hotRuntime` object form's recycling options, shared by both of its modes. */
export interface HotRuntimeRecycleOptions {
  recycleAfterFiles?: number;
  memoryLimit?: number;
  preserveGlobals?: string[];
  esmGeneration?: boolean;
  freshRuntime?: boolean;
}

export interface VitestNativeOptions {
  /** Target platform. Default: 'ios' */
  platform?: "ios" | "android";

  /**
   * Test engine.
   * - 'mock'   — pure-JS reimplementation of React Native (fastest, lower fidelity).
   * - 'native' — runs real React Native JS, mocking only the native boundary
   *              (highest fidelity).
   * - 'auto'   — resolves to 'native' when '@react-native/babel-preset' and
   *              '@babel/core' are available, otherwise falls back to 'mock'.
   * Default: 'auto'.
   */
  engine?: "auto" | "mock" | "native";

  /**
   * Built-in third-party library presets.
   *
   * An ARRAY replaces auto-detection entirely: only those presets are used.
   *
   * An OBJECT keeps auto-detection and turns individual presets off by name —
   * `{ navigation: false }` — which is what you want when one preset gets in the
   * way. Listing every other detected preset back by hand just to drop one is
   * both tedious and a thing that silently rots as dependencies change.
   *
   * Preset modules of your own are listed by path: a module whose default export is a
   * `Preset` or a function returning one. In an array they sit beside vitest-native's
   * presets (`presets.reanimated()`, ...); in the object form a path set to `true`
   * adds one to the auto-detected presets. A preset object of your own cannot be
   * listed directly, because its factories run in the test workers, which a function
   * in the config cannot reach; the plugin imports the module there instead. A
   * relative path resolves from the project root.
   *
   * @example
   * ```ts
   * import { reactNative, presets } from 'vitest-native';
   * reactNative({ presets: { navigation: false, './test/presets/my-lib.ts': true } })
   * reactNative({ presets: [presets.reanimated(), './test/presets/my-lib.ts'] })
   * ```
   */
  presets?: (Preset | string)[] | Record<string, boolean>;

  /**
   * `engine: 'mock'` only. Plain-data overrides merged into the react-native
   * module mock.
   * Values must be JSON-serializable (strings, numbers, booleans, plain
   * objects, arrays). Function values are not supported — use vi.mock()
   * in a setup file for function-based overrides.
   *
   * @example
   * ```ts
   * reactNative({ mocks: { Platform: { OS: 'web' } } })
   * ```
   */
  mocks?: Record<string, any>;

  /** Log plugin activity. Default: false */
  diagnostics?: boolean;

  /**
   * Compile project source with the project's own Babel config where it needs a
   * plugin or option that Vite's Oxc transform does not cover (legacy decorators,
   * macros, a custom plugin), as Metro and babel-jest do. Packages in node_modules
   * are not affected.
   *
   * - `'auto'` (default): a project file compiles with Babel only when the config
   *   Babel loads for it has a plugin, preset or option outside what Oxc and the
   *   engine already cover; an unknown plugin counts as outside. Every other file
   *   keeps Oxc. The plugins that caused it are named once at startup.
   * - `'always'`: every project file the config applies to compiles with Babel, as
   *   under babel-jest.
   * - `'never'`: project source compiles with Oxc only.
   *
   * A Babel plugin already in the Vite config (such as `@rolldown/plugin-babel`)
   * compiles that source itself, and this steps aside for it.
   */
  projectBabel?: "auto" | "always" | "never";

  /** Additional asset file extensions, loaded as Metro loads assets (e.g. ['.lottie', '.m4b']) */
  assetExts?: string[];

  /**
   * Experimental. Read the project's declarative Metro resolution profile in a
   * short-lived, memory-bounded child. Default: false (built-in React Native
   * extension/asset defaults). Pass true or an options object to opt in.
   *
   * Imperative `resolver.resolveRequest` behavior cannot be transferred as data:
   * when the config installs one, the source and asset extensions still apply and
   * a warning names the gap. Main fields and conditions are reported under
   * diagnostics but retain the engine's ownership policy.
   */
  metroConfig?:
    | boolean
    | {
        configFile?: string;
      };

  /**
   * `engine: 'native'` only. Names of additional node_modules packages whose
   * source the native engine should transform (Flow/TS/JSX stripped) as it
   * loads them. Packages the project depends on that declare `react-native` as
   * a dependency or peer dependency, and their runtime dependencies, are
   * detected and transformed without being listed; list a package here when it
   * ships untranspiled source but is not detected, as you would add it to
   * Jest's `transformIgnorePatterns` allowlist. A listed package's own
   * dependencies are transformed too.
   *
   * The object form adds `exclude`, which names packages the engine must NEVER
   * transform, whatever else would have selected them — auto-detection, a detected
   * package's dependency closure, or the engine's own built-in lists.
   *
   * `exclude` exists because the engine's judgement about what is React Native source
   * is a heuristic, and when it guesses wrong the failure is a parse error deep inside
   * a package the project never named. Build toolchains are the recurring case:
   * compiling one re-enters Babel while it is loading. The engine excludes the ones it
   * knows about, but that list is only as current as the last release — `exclude` is
   * how a project unblocks itself the same day, without waiting for one.
   *
   * Run with `diagnostics: true` to print the packages the engine chose to compile;
   * that list is what `exclude` subtracts from.
   *
   * @example
   * ```ts
   * reactNative({ engine: 'native', transform: ['some-untranspiled-lib'] })
   *
   * reactNative({
   *   engine: 'native',
   *   transform: {
   *     include: ['some-untranspiled-lib'],
   *     exclude: ['some-build-tool'], // never hand this to the Babel preset
   *   },
   * })
   * ```
   */
  transform?: string[] | { include?: string[]; exclude?: string[] };

  /**
   * `engine: 'native'` only. Behaviour changes that are not the default yet. Each is
   * decided (made the default, or removed) by the date in `src/flags.ts`.
   */
  experimental?: {
    /**
     * `engine: 'native'` only. A `vi.mock` applies to the modules Node loads too, as a
     * `jest.mock` does under Jest: an installed package's own `require` or `import` of
     * the mocked module gets the test's mocked module, the same instance (#322). That
     * holds for a factory, an automock, `{ spy: true }` and a `__mocks__` file. What
     * Node cannot be served fails by name, `MOCK_NOT_SEEN_BY_NODE`, instead of loading
     * the real module: an async factory that has not settled, an automock or `__mocks__`
     * file the test has not imported yet, a `vi.doMock` or `vi.doUnmock` not applied
     * yet, and a package Vite and Node resolve to different files. A module Node
     * already loaded keeps what it required, as under Jest without
     * `jest.resetModules()`, and an ES module reads each export of the mock once, when
     * it loads (a getter on a factory's result is not a live binding there). Default:
     * `false`, and on with `ownershipModel: 'resolution'`, which refuses it set to
     * `false`.
     */
    nodeMocks?: boolean;
    /**
     * `'resolver'`: Vite, Node's CommonJS loader and its ESM loader resolve every bare
     * request through one shared resolver, from one set of inputs, so a package loaded
     * by both module systems is one module. Where a package's `exports` map has both
     * `import` and `require` builds, both sides load the `require` one. Native engine
     * only. `'resolution'` adds the bridge: Node's \`require\` of a file Vite owns gets
     * Vite's own instance, evaluated then if Vite has not yet, so the order a test loads
     * files in cannot split a module. `'resolution'` turns `nodeMocks` on: a mocked module
     * the bridge or Node reaches is the test's mock. See https://vitest-native.danfry.dev/guide/plugin-options#experimental.
     */
    ownershipModel?: "resolver" | "resolution";
  };

  /**
   * `engine: 'native'` only. Built on Vitest's experimental custom-pool API.
   * Run tests in persistent
   * RN-hot workers: React Native's module graph loads once per worker and
   * stays resident across test files, while each file still gets a fresh
   * Vitest module runner (per-file isolation of your app/test modules).
   * Uses a custom Vitest pool + worker entry + runner; requires Vitest >= 4.
   *
   * Pass an object to tune worker recycling (self-defense against suites that
   * leak process-wide resources the per-file reset can't reclaim):
   * - `recycleAfterFiles`: retire a worker after it has run N test files. This
   *   is enforced between Vitest scheduler tasks; a single task containing
   *   multiple files cannot be interrupted.
   * - `memoryLimit`: retire a worker when its reported JS heap (bytes) meets
   *   or exceeds this value, also between scheduler tasks. By default a
   *   constrained-memory-aware plan derives this threshold, caps automatic
   *   concurrency at four, reserves main-process and worker-replacement RSS,
   *   and stops before crossing 90% of the host/container limit. A worker count
   *   you set (`maxWorkers`, `--maxWorkers` or `VITEST_MAX_WORKERS`) is capped
   *   only by what that memory envelope admits.
   * - `allowUnboundedMemory`: explicitly permit configurations where Vitest
   *   cannot enforce file-boundary recycling, notably `maxWorkers: 1`. This
   *   also disables the automatic worker cap and process-RSS hard stop. Use
   *   only when an external scheduler provides the memory boundary.
   * - `preserveGlobals`: exact globalThis property names intentionally owned
   *   by resident external libraries. App/test globals are otherwise removed
   *   between files. Storybook's preview registry is preserved automatically.
   * - `esmGeneration`: re-evaluate externalized packages a test file `import`s,
   *   so their module-level state does not carry into the next file. Node's ESM
   *   registry cannot be invalidated, so the loader stamps a per-file generation
   *   onto the resolved URL instead. On by default, because without it those
   *   packages behave differently under hot than under stock isolation. It costs
   *   re-execution: a suite whose files import many externalized (non-React
   *   Native) packages measured 55% more wall clock at the extreme — still 9x
   *   stock isolation, against 13.9x with it off. Set false to trade that back,
   *   accepting that a package holding state across files will keep it. While it
   *   is on, hot workers leave Node's V8 compile cache off, because every file
   *   would add an entry per re-evaluated module (unless `NODE_COMPILE_CACHE` is
   *   set, which turns the cache on before vitest-native runs).
   * - `freshRuntime` (experimental, off by default): React, its renderers, `scheduler`
   *   and React Native Testing Library run again for every test file, as React Native
   *   does, instead of staying loaded for the worker's life. State they hold at module
   *   level (`useId` counters, warning de-duplication, scheduler timers) then starts
   *   fresh in each file, as under per-file isolation. It costs re-execution: about
   *   20 ms per file with one worker and 5 ms with four, on a 135-file suite. Requires
   *   `esmGeneration`.
   *
   * `'auto'` selects the bounded hot runtime when the configuration has recyclable
   * task boundaries (enough memory headroom for at least two workers) and no
   * explicit custom pool; otherwise the run keeps per-file isolation and prints the
   * reason for falling back.
   *
   * - `mode: 'auto'` in the object form selects the same way, with the object's
   *   recycling options applied when the hot runtime runs:
   *   `{ mode: 'auto', memoryLimit: 2 * 1024 ** 3 }`. Without `mode`, the object
   *   form requires the hot runtime, as `true` does. Cannot be combined with
   *   `allowUnboundedMemory: true`. Worker count and process-RSS limits still come
   *   from the memory plan; `memoryLimit: 0` turns the heap threshold off.
   *
   * Default: `'auto'` (since 0.16; `false` before): the hot runtime where the run can be
   * bounded, per-file isolation otherwise. The hot runtime has known differences from
   * per-file isolation, listed in the troubleshooting guide; `false` keeps a fresh
   * worker per file, with React Native reloaded per file.
   */
  hotRuntime?:
    | boolean
    | "auto"
    | (HotRuntimeRecycleOptions & { mode?: undefined; allowUnboundedMemory?: boolean })
    | (HotRuntimeRecycleOptions & { mode: "auto"; allowUnboundedMemory?: false });

  /**
   * `engine: 'native'` only. How native module lookups answer.
   *
   * - `'device'`: as on a device. `NativeModules[name]` and
   *   `TurboModuleRegistry.get(name)` find React Native's own modules and those
   *   registered with `mockNativeModule()`, and are `undefined`/`null` for any other
   *   name. A React Native module's stub has only the members of its codegen spec.
   * - `'permissive'`: every name is present for every lookup, and every stub answers
   *   every property with a method. An escape hatch for suites written against that
   *   behaviour; prefer registering the modules a test needs with `mockNativeModule()`.
   *
   * Default: `'device'`.
   */
  nativeModules?: "device" | "permissive";

  /**
   * `engine: 'native'` only. What a run does when React Native's precompiled registry
   * is not in the cache yet (first install, an upgrade of React Native or
   * vitest-native, a Babel toolchain change, a cleared cache).
   *
   * - `'background'` *(default)*: the run starts at once and the registry compiles in
   *   a low-priority background process. Test files that start before it is ready
   *   load React Native file by file; files that start after use it. When Vitest
   *   closes, a build still running gets up to half of `teardownTimeout` to finish,
   *   so the next run starts warm.
   * - `'wait'`: compile the registry before the run starts, as in earlier versions.
   *
   * The hot runtime, CI runs and `experimental.ownershipModel` always wait.
   */
  registryBuild?: "background" | "wait";

  /**
   * Fail the run when no test makes progress for this many milliseconds, naming the files
   * and tests that were running. A module loaded through Vite counts as progress, so a
   * cold start that is still importing is not taken for a hang. Default: 60 000, or twice
   * the larger of `testTimeout` and `hookTimeout` if that is longer. `false` turns it off.
   * Off while a debugger is attached.
   *
   * Vitest's `testTimeout` runs on the test's own worker, so a test stuck in synchronous
   * code (a loop that never ends) never reaches it, and the run waits forever with nothing
   * on screen. This watch runs in Vitest's main process, which stays responsive, so it can
   * still say where the run stopped.
   */
  hangTimeout?: number | false;

  /**
   * `engine: 'native'` only. What happens when one file is evaluated by both Node and
   * Vite in a worker. Such a file exists twice, and module state written through one
   * copy is not seen by the other; nothing else reports it.
   *
   * - `'warn'`: report each such file once per worker, naming both sides, the route
   *   and the fix.
   * - `'error'`: throw `SOURCE_EVALUATED_TWICE` at the second evaluation and fail the
   *   test file. A second Node copy never runs; a second Vite copy has run its top level
   *   when it is seen, and its import throws.
   *
   * The object form adds `allow`, the only exemption: a file or directory (resolved
   * against the Vitest root) and the reason it is deliberate. Detection cannot be turned
   * off.
   *
   * Default: `'warn'`.
   * See https://vitest-native.danfry.dev/guide/errors#SOURCE_EVALUATED_TWICE.
   */
  ownership?:
    | "warn"
    | "error"
    | {
        mode?: "warn" | "error";
        allow?: { path: string; reason: string }[];
      };
}

export interface ResolvedOptions {
  platform: "ios" | "android";
  engine: "mock" | "native";
  diagnostics: boolean;
  extensions: string[];
  presets: Preset[];
  mocks: Record<string, any>;
  assetExts: string[];
}
