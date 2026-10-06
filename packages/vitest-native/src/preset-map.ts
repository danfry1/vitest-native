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
  "@react-native-community/netinfo": "netInfo",
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
  // package from ecosystem auto-detection/Node transformation (see native/ecosystem.ts) and makes
  // `doctor` and `migrate` report it as already handled. A legacy vector-icons
  // project therefore had its untranspiled source neither shadowed nor
  // transformed — the parse failure automatic detection exists to prevent.
  "@shopify/flash-list": "flashList",
  "@gorhom/bottom-sheet": "bottomSheet",
  "react-native-keyboard-controller": "keyboardController",
} as const satisfies Record<string, PresetName>;

/**
 * Packages whose own JavaScript switches to a built-in in-memory implementation under
 * Vitest, from the given major on. Their preset would replace the real library with a
 * hand-written approximation, so it steps aside and the library tests itself:
 * - react-native-mmkv 3+: `isTest()` checks `VITEST_WORKER_ID` (and Jest's
 *   `JEST_WORKER_ID`), and `createMMKV` then returns `createMockMMKV()` — the real
 *   API (v4's `remove`, change listeners) with no native module. v4 imports
 *   react-native-nitro-modules at load time, which the native engine's Nitro boundary
 *   satisfies (see native/boundary.mjs). Before v3 there was no Vitest check.
 */
export const SELF_TESTING_FROM_MAJOR: Partial<Record<keyof typeof AUTO_DETECT_PRESETS, number>> = {
  "react-native-mmkv": 3,
};

function installedMajor(pkgName: string, req: NodeJS.Require): number | null {
  try {
    const version = (req(`${pkgName}/package.json`) as { version?: unknown }).version;
    const major = typeof version === "string" ? Number.parseInt(version, 10) : NaN;
    return Number.isNaN(major) ? null : major;
  } catch {
    return null;
  }
}

/**
 * The preset that shadows `pkgName` in this project, or null when the package is not
 * installed or tests itself (SELF_TESTING_FROM_MAJOR). Every place that decides which
 * presets are active asks this, so the plugin, the worker setup and ecosystem
 * detection cannot disagree about a package.
 */
export function presetForInstalled(pkgName: string, req: NodeJS.Require): PresetName | null {
  try {
    req.resolve(pkgName);
  } catch {
    return null;
  }
  const floor = SELF_TESTING_FROM_MAJOR[pkgName as keyof typeof AUTO_DETECT_PRESETS];
  if (floor !== undefined) {
    const major = installedMajor(pkgName, req);
    if (major !== null && major >= floor) return null;
  }
  return AUTO_DETECT_PRESETS[pkgName as keyof typeof AUTO_DETECT_PRESETS] ?? null;
}
