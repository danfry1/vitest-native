import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { METRO_ASSET_EXTS } from "./native/assets.mjs";
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
  "react-native-unistyles": "unistyles",
  // Skia's name from 2.15.0 and its name before.
  "react-native-skia": "skia",
  "@shopify/react-native-skia": "skia",
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

/**
 * Presets the native engine does not apply unless asked to, because the packages they
 * cover run as themselves there. The native engine runs a package's own JavaScript and
 * substitutes only its native module, the way jest-expo runs Expo packages: the real
 * code is the whole API, current with every SDK, where a replacement covers only what
 * was written into it.
 *
 * - gestureHandler, flashList: the packages run as themselves, with the Jest setup file
 *   each ships (LIBRARY_SETUP_FILES) replacing their native layer, as under Jest. The
 *   hand-written presets replaced the whole package and lacked most of its API
 *   (gesture-handler 3's hook API, its builder methods; tests/preset-library-mocks.test.ts).
 * - expo: expo-constants, expo-font, expo-asset, expo-splash-screen, expo-linking and
 *   expo-status-bar run against the engine's Expo runtime (native/globals.mjs) and
 *   their own native-module mocks (native/expo-module-mocks.mjs). Measured on an
 *   Expo SDK 58 app against jest-expo: 17 of 17 probes of these packages matched with
 *   the preset off, 4 with it on. The preset was missing API (`hide`, `setOptions`,
 *   `useAssets`, `canOpenURL` …) and answered with values jest-expo never gives
 *   (`Constants.expoConfig.name === 'test-app'`).
 *
 * The mock engine has no real React Native to run them on, so it keeps these presets.
 * `presets: { expo: true }` applies one under the native engine too.
 */
export const NATIVE_ENGINE_RUNS_PACKAGES: readonly PresetName[] = [
  "expo",
  "gestureHandler",
  "flashList",
];

/**
 * The Jest setup files libraries ship for their real JavaScript, which the native engine
 * runs before the project's own setup files for each installed package whose preset
 * steps aside (NATIVE_ENGINE_RUNS_PACKAGES), as a Jest suite lists them in `setupFiles`.
 * Each replaces only the library's native layer: gesture-handler's its native module
 * and host components, flash-list's its layout measurement. They run with Jest's
 * module-registry semantics (native/library-jest.mjs).
 */
export const LIBRARY_SETUP_FILES: Readonly<Partial<Record<PresetName, string>>> = {
  gestureHandler: "react-native-gesture-handler/jestSetup.js",
  flashList: "@shopify/flash-list/jestSetup.js",
};

/**
 * Whether `pkg`, resolved from `projectRoot`, ships the Jest resolver its JS
 * implementation loads through in a test runner (native/jest-resolvers.mjs): from
 * react-native-worklets 0.9 and react-native-reanimated 4.7. Without it the package's
 * `.native` initializers load and throw ("Native part of Worklets doesn't seem to be
 * initialized"), so its preset keeps applying.
 */
export function shipsJestResolver(projectRoot: string, pkg: string): boolean {
  // On disk, up the node_modules directories as Node looks a package up: through
  // require(), a preset's require() bridge in a mock-engine worker answers for the
  // package, and its `exports` may not expose the file.
  for (let dir = path.resolve(projectRoot); ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, "node_modules", pkg, "package.json");
    if (fs.existsSync(manifest)) {
      return fs.existsSync(path.join(path.dirname(manifest), "jest", "resolver.js"));
    }
    if (path.dirname(dir) === dir) return false;
  }
}

/** The installed reanimated's directory, from `root`, or null. */
export function reanimatedDir(root: string): string | null {
  try {
    return path.dirname(
      createRequire(path.join(root, "package.json")).resolve(
        "react-native-reanimated/package.json",
      ),
    );
  } catch {
    return null;
  }
}

/** A library's own Jest mock, which a preset's module is under the native engine. */
export interface LibraryMock {
  /** The package the preset shadows. */
  pkg: string;
  /** The mock's built file inside the package, which its export names are read from. */
  file: string;
  /** The mock's path inside the package as `require` takes it ("mock", "jest/mock"); by default `file`. */
  entry?: string;
  /** Further files whose names the mock module also provides (reanimated's mock-svg). */
  alsoFiles?: string[];
  /** The export the mock module is, when it is not the whole module ("default"). */
  exportKey?: string;
  /** Whether the installed package can run its mock here; by default, whether `entry` resolves. */
  available?: (packageDir: string, projectRoot: string) => boolean;
  /**
   * The preset's own names the mock lacks stay, from the preset's module: names a
   * previous release served (bottom-sheet's `*_STATUS` enums and `BottomSheetFooter`,
   * netinfo's `useNetInfoInstance`), so moving to the library's mock removes nothing.
   */
  keepsPresetNames?: boolean;
  /**
   * Whether the mock's module body sets up globals of the test environment
   * (worklets' sets `requestAnimationFrame`). Such a mock is built as each file is set
   * up, as a Jest suite installs it in its setup, before a test can install fake timers
   * the global would then replace.
   */
  setsGlobals?: boolean;
}

/** Marks a preset module that native/setup.mjs builds as each file is set up. */
export const BUILT_AT_SETUP = Symbol.for("vitest-native.preset-built-at-setup");

/** react-native-worklets' own mock, which reanimated's own mock runs over. */
export const WORKLETS_MOCK: LibraryMock = {
  pkg: "react-native-worklets",
  file: "lib/module/mock.js",
  setsGlobals: true,
};

/** The installed package's directory, from `root`, when it ships `mock`; else null. */
export function libraryMockDir(mock: LibraryMock, root: string): string | null {
  let byRoot = mockDirs.get(mock);
  if (byRoot === undefined) mockDirs.set(mock, (byRoot = new Map()));
  const key = root;
  let dir = byRoot.get(key);
  if (dir === undefined) {
    dir = null;
    // On disk, up the node_modules directories: through require(), a preset's
    // require() bridge in a mock-engine worker answers for the package.
    for (let at = path.resolve(root); ; at = path.dirname(at)) {
      const candidate = path.join(at, "node_modules", mock.pkg);
      if (fs.existsSync(path.join(candidate, "package.json"))) {
        const real = fs.realpathSync(candidate);
        const available =
          mock.available ??
          ((d: string) => fs.existsSync(path.join(d, mock.file)) && entryResolves(mock, root));
        if (available(real, root)) dir = real;
        break;
      }
      if (path.dirname(at) === at) break;
    }
    byRoot.set(key, dir);
  }
  return dir;
}
// Asked by a preset's module on every test file; the installed packages do not change
// during a run.
// Per mock: each has its own file, entry and availability, and a package can have more than one.
const mockDirs = new WeakMap<LibraryMock, Map<string, string | null>>();

/** Whether `require` of the mock's entry from `root` resolves (an `exports` map can refuse it). */
function entryResolves(mock: LibraryMock, root: string): boolean {
  try {
    createRequire(path.join(root, "package.json")).resolve(
      `${mock.pkg}/${mock.entry ?? mock.file}`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether reanimated's own mock can run for `projectRoot`: it loads the real package,
 * whose JS implementation loads only through reanimated's and worklets' Jest resolvers
 * (reanimated 4.7, worklets 0.9), over worklets' own mock. Before those, the real
 * package's `.native` initializers throw, and the module below serves instead, as under
 * the mock engine.
 */
export function libraryMockUsable(projectRoot: string): boolean {
  let usable = mockUsable.get(projectRoot);
  if (usable === undefined) {
    const dir = reanimatedDir(projectRoot);
    usable =
      dir !== null &&
      shipsJestResolver(projectRoot, "react-native-reanimated") &&
      shipsJestResolver(dir, "react-native-worklets") &&
      libraryMockDir(WORKLETS_MOCK, dir) !== null;
    mockUsable.set(projectRoot, usable);
  }
  return usable;
}
// Asked by the preset's module on every test file.
const mockUsable = new Map<string, boolean>();

/**
 * The entries of the library module graphs the native engine precompiles into the
 * library registry (native/registry.mjs, buildLibraryRegistry), for the presets active
 * under it: each library's own mock that a preset's module is. Without them those
 * packages load file by file.
 */
export function libraryRegistryEntries(
  projectRoot: string,
  activePresets: readonly string[],
): string[] {
  const entries: string[] = [];
  if (activePresets.includes("reanimated") && libraryMockUsable(projectRoot)) {
    entries.push("react-native-reanimated/mock");
  }
  if (activePresets.includes("worklets") && libraryMockDir(WORKLETS_MOCK, projectRoot)) {
    entries.push(`${WORKLETS_MOCK.pkg}/${WORKLETS_MOCK.file}`);
  }
  return entries;
}

/**
 * Whether an auto-detected preset applies under `engine`, given the `presets` option:
 * every one under the mock engine, and under the native engine all but those in
 * NATIVE_ENGINE_RUNS_PACKAGES, unless the option turns one on (`{ expo: true }`).
 */
export function autoDetectedPresetApplies(
  preset: string,
  engine: "mock" | "native",
  presetsOption?: unknown,
): boolean {
  if (engine === "mock" || !(NATIVE_ENGINE_RUNS_PACKAGES as readonly string[]).includes(preset)) {
    return true;
  }
  return (
    presetsOption !== null &&
    typeof presetsOption === "object" &&
    !Array.isArray(presetsOption) &&
    (presetsOption as Record<string, unknown>)[preset] === true
  );
}

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
  unistyles: ["react-native-unistyles", "react-native-unistyles/reanimated"],
  skia: ["react-native-skia", "@shopify/react-native-skia"],
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
  // Metro's own defaults (`assetExts` in metro-config), as an app built with no
  // Metro config of its own resolves them.
  ...METRO_ASSET_EXTS,
  // Image and font types React Native apps commonly add to Metro's `assetExts`.
  "tiff",
  "heic",
  "heif",
  "woff",
  "woff2",
];
