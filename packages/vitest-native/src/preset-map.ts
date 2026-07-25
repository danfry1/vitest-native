import type * as Presets from "./presets/index.js";

/** Valid preset factory names exported from `presets/index.ts`. */
export type PresetName = keyof typeof Presets;

/**
 * Map of npm package names to their built-in preset export names.
 * Shared between plugin.ts (Vite main process) and setup.ts (Vitest workers).
 */
export const AUTO_DETECT_PRESETS = {
  "react-native-reanimated": "reanimated",
  "react-native-worklets": "worklets",
  "react-native-gesture-handler": "gestureHandler",
  "react-native-safe-area-context": "safeAreaContext",
  "@react-navigation/native": "navigation",
  "@react-navigation/native-stack": "navigation",
  "@react-navigation/bottom-tabs": "navigation",
  "@react-navigation/elements": "navigation",
  "@react-navigation/drawer": "navigation",
  "@react-native-async-storage/async-storage": "asyncStorage",
  "react-native-screens": "screens",
  "expo-constants": "expo",
  "react-native-device-info": "deviceInfo",
  "react-native-mmkv": "mmkv",
  "react-native-svg": "svg",
  "react-native-webview": "webview",
  "@react-native-vector-icons/common": "vectorIcons",
  // NOT the legacy unscoped `react-native-vector-icons`. The vectorIcons preset
  // shadows one module, @react-native-vector-icons/common, which is the shared
  // factory the v10+ scoped icon-set packages are built on. The legacy package
  // predates that split and does not use it, so the preset has nothing to give it.
  //
  // Listing it here was worse than omitting it: a name in this map is taken as
  // "a preset shadows this, its real source never loads", which excludes the
  // package from ecosystem auto-inlining (see native/ecosystem.ts) and makes
  // `doctor` and `migrate` report it as already handled. A legacy vector-icons
  // project therefore had its untranspiled source neither shadowed nor
  // transformed — the parse failure auto-inlining exists to prevent.
  "@shopify/flash-list": "flashList",
  "@gorhom/bottom-sheet": "bottomSheet",
  "react-native-keyboard-controller": "keyboardController",
} as const satisfies Record<string, PresetName>;
