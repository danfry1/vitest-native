import fs from "node:fs";
import path from "node:path";
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

/** Whether `pkgName` at `version` runs its own test mode (SELF_TESTING_FROM_MAJOR). */
export function testsItself(pkgName: string, version: unknown): boolean {
  const floor = SELF_TESTING_FROM_MAJOR[pkgName as keyof typeof AUTO_DETECT_PRESETS];
  if (floor === undefined || typeof version !== "string") return false;
  const major = Number.parseInt(version, 10);
  return !Number.isNaN(major) && major >= floor;
}

/**
 * The installed version, from the package's own manifest on disk. Not
 * `require('<pkg>/package.json')`: a package whose `exports` map omits ./package.json
 * throws there, and a gate that fails closed would put the preset back over a library
 * that tests itself, silently.
 */
function installedVersion(pkgName: string, req: NodeJS.Require): unknown {
  let dir: string;
  try {
    dir = path.dirname(req.resolve(pkgName));
  } catch {
    return undefined;
  }
  for (;;) {
    const file = path.join(dir, "package.json");
    if (fs.existsSync(file)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as {
          name?: unknown;
          version?: unknown;
        };
        if (manifest.name === pkgName) return manifest.version;
      } catch {
        // An unreadable manifest on the way up: keep walking.
      }
    }
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
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
  if (testsItself(pkgName, installedVersion(pkgName, req))) return null;
  return AUTO_DETECT_PRESETS[pkgName as keyof typeof AUTO_DETECT_PRESETS] ?? null;
}

/**
 * The module ids each preset shadows — `Object.keys(preset().modules)`, written out.
 *
 * The CLI states what a preset covers (`migrate`: "the expo preset shadows
 * expo-constants, …"; "__mocks__/x — the y preset shadows it"), and a claim like that
 * must come from the preset itself. The presets cannot be imported to ask: they load
 * `vitest` and `react`, which the CLI must not require (doctor runs in projects where
 * neither resolves yet). So the ids are listed here, and `tests/preset-map.test.ts`
 * calls every preset factory and fails if a list and its preset disagree in either
 * direction, so the two cannot drift without a red build.
 */
export const PRESET_MODULES = {
  reanimated: ["react-native-reanimated"],
  worklets: ["react-native-worklets"],
  gestureHandler: ["react-native-gesture-handler"],
  safeAreaContext: ["react-native-safe-area-context"],
  navigation: [
    "@react-navigation/native",
    "@react-navigation/native-stack",
    "@react-navigation/bottom-tabs",
    "@react-navigation/drawer",
    "@react-navigation/elements",
  ],
  asyncStorage: ["@react-native-async-storage/async-storage"],
  screens: ["react-native-screens"],
  expo: [
    "expo-constants",
    "expo-font",
    "expo-asset",
    "expo-splash-screen",
    "expo-linking",
    "expo-status-bar",
  ],
  deviceInfo: ["react-native-device-info"],
  mmkv: ["react-native-mmkv"],
  netInfo: ["@react-native-community/netinfo"],
  svg: ["react-native-svg"],
  webview: ["react-native-webview"],
  vectorIcons: ["@react-native-vector-icons/common"],
  flashList: ["@shopify/flash-list"],
  bottomSheet: ["@gorhom/bottom-sheet"],
  keyboardController: ["react-native-keyboard-controller"],
} as const satisfies Record<PresetName, readonly string[]>;

/** The preset that shadows `moduleId`, or undefined when none does. */
export function presetShadowing(moduleId: string): PresetName | undefined {
  for (const [preset, modules] of Object.entries(PRESET_MODULES)) {
    if ((modules as readonly string[]).includes(moduleId)) return preset as PresetName;
  }
  return undefined;
}

/**
 * Asset extensions the plugin handles before any Metro profile or `assetExts` option
 * adds more. Kept here, not in plugin.ts, so the CLI can say which of a Jest asset
 * mapper's extensions are covered without loading the plugin.
 */
export const DEFAULT_ASSET_EXTS: readonly string[] = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "svg",
  "tiff",
  "heic",
  "heif",
  "mp4",
  "mp3",
  "wav",
  "aac",
  "m4a",
  "mov",
  "webm",
  "ttf",
  "otf",
  "woff",
  "woff2",
];
