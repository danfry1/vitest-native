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
}

export interface VitestNativeOptions {
  /** Target platform. Default: 'ios' */
  platform?: "ios" | "android";

  /**
   * Built-in third-party library presets. When provided, only these presets
   * are used. When omitted, vitest-native auto-detects installed packages
   * and enables matching presets automatically.
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
  presets?: Preset[];

  /**
   * Plain-data overrides merged into the react-native module mock.
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
}

export interface ResolvedOptions {
  platform: "ios" | "android";
  diagnostics: boolean;
  extensions: string[];
  presets: Preset[];
  mocks: Record<string, any>;
  assetExts: string[];
}
