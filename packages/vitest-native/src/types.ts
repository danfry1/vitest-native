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
}

export interface Preset {
  name: string;
  modules: Record<string, PresetModule>;
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
   * Only built-in presets are supported (reanimated, gestureHandler,
   * safeAreaContext, navigation, asyncStorage, screens, expo). For custom
   * module mocking, use vi.mock() in a setup file.
   *
   * @example
   * ```ts
   * import { reactNative, presets } from 'vitest-native';
   * reactNative({ presets: [presets.reanimated(), presets.navigation()] })
   * ```
   */
  presets?: Preset[] | Record<string, boolean>;

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

  /** Additional asset file extensions to stub (e.g. ['.lottie', '.m4b']) */
  assetExts?: string[];

  /**
   * `engine: 'native'` only. Names of additional node_modules packages whose
   * source the native engine should transform (Flow/TS/JSX stripped) as it
   * loads them. By default only `react-native` / `@react-native` are
   * transformed; third-party RN libraries that ship untranspiled source
   * (e.g. `react-native-reanimated`, `react-native-safe-area-context`) need to
   * be listed here, analogous to Jest's `transformIgnorePatterns` allowlist.
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
   * reactNative({ engine: 'native', transform: ['react-native-reanimated'] })
   *
   * reactNative({
   *   engine: 'native',
   *   transform: {
   *     include: ['react-native-reanimated'],
   *     exclude: ['some-build-tool'], // never hand this to the Babel preset
   *   },
   * })
   * ```
   */
  transform?: string[] | { include?: string[]; exclude?: string[] };

  /**
   * `engine: 'native'` only. **Experimental.** Run tests in persistent
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
   *   or exceeds this value, also between scheduler tasks. When hot is enabled
   *   and you set neither `memoryLimit` nor `recycleAfterFiles`, a default
   *   per-worker bound of `clamp(totalmem * 0.25, 768MB, 1.5GB)` is applied so
   *   memory stays bounded out of the box (multi-worker runs recycle a worker
   *   once it crosses the ceiling). Single-worker hot can't recycle, so the
   *   bound is inert there — run with `maxWorkers >= 2` for bounded hot memory.
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
   *   accepting that a package holding state across files will keep it.
   *
   * Default: false (each file runs in a fresh worker; RN reloads per file).
   */
  hotRuntime?:
    | boolean
    | {
        recycleAfterFiles?: number;
        memoryLimit?: number;
        preserveGlobals?: string[];
        esmGeneration?: boolean;
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
