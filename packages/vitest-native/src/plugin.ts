import type { Plugin } from "vite";
import type { VitestNativeOptions, ResolvedOptions, Preset } from "./types.js";
import { getPlatformExtensions } from "./resolve.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const DEFAULT_ASSET_EXTS = [
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

/** Strip Vite's /@fs/ prefix to get a real filesystem path. */
function stripFsPrefix(id: string): string {
  return id.startsWith("/@fs/") ? id.slice(4) : id;
}

import { AUTO_DETECT_PRESETS } from "./preset-map.js";

/**
 * Check if a package is installed from the consumer's project root,
 * not from the plugin's own node_modules. This is critical for monorepos
 * and non-hoisted layouts (pnpm strict, yarn PnP).
 */
function isPackageInstalled(packageName: string, projectRoot: string): boolean {
  try {
    const req = createRequire(path.join(projectRoot, "package.json"));
    req.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

async function autoDetectPresets(diagnostics: boolean, projectRoot: string): Promise<Preset[]> {
  const detected: Preset[] = [];
  // Lazy import avoids pulling vitest into the Vite main process at module
  // load time. The presets module imports vi from vitest at the top level,
  // which is only safe inside Vitest worker processes. Dynamic import()
  // defers this until configResolved, where Vitest is initialized.
  const presetFactories = (await import("./presets/index.js")) as Record<string, unknown>;

  for (const [pkgName, exportName] of Object.entries(AUTO_DETECT_PRESETS)) {
    if (isPackageInstalled(pkgName, projectRoot)) {
      const factory = presetFactories[exportName];
      if (typeof factory === "function") {
        detected.push(factory());
        if (diagnostics) {
          console.log(`[vitest-native] Auto-detected ${pkgName} → enabled ${exportName} preset`);
        }
      }
    }
  }
  return detected;
}

async function resolveOptions(
  options: VitestNativeOptions = {},
  projectRoot?: string,
): Promise<ResolvedOptions> {
  const platform = options.platform ?? "ios";
  const diagnostics = options.diagnostics ?? false;
  const userExts = (options.assetExts ?? []).map((e) => e.replace(/^\./, ""));

  // If user provided presets explicitly, use those. Otherwise auto-detect.
  let presets: Preset[];
  if (options.presets) {
    presets = options.presets;
  } else {
    presets = await autoDetectPresets(diagnostics, projectRoot ?? process.cwd());
  }

  return {
    platform,
    diagnostics,
    extensions: getPlatformExtensions(platform),
    presets,
    mocks: options.mocks ?? {},
    assetExts: [...DEFAULT_ASSET_EXTS, ...userExts],
  };
}

/**
 * All named exports from the react-native mock that virtual subpath
 * modules should re-export. Kept in sync with registry.ts.
 */
const RN_EXPORT_NAMES = [
  // Components
  "View",
  "Text",
  "Image",
  "TextInput",
  "ScrollView",
  "FlatList",
  "SectionList",
  "Modal",
  "Pressable",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "TouchableNativeFeedback",
  "ActivityIndicator",
  "Button",
  "Switch",
  "RefreshControl",
  "StatusBar",
  "SafeAreaView",
  "KeyboardAvoidingView",
  "ImageBackground",
  "VirtualizedList",
  "InputAccessoryView",
  "DrawerLayoutAndroid",
  // APIs
  "Platform",
  "Dimensions",
  "StyleSheet",
  "Animated",
  "Alert",
  "Linking",
  "AppState",
  "Keyboard",
  "BackHandler",
  "Vibration",
  "PermissionsAndroid",
  "Appearance",
  "PixelRatio",
  "LayoutAnimation",
  "Clipboard",
  "Share",
  "AccessibilityInfo",
  "InteractionManager",
  "PanResponder",
  "ToastAndroid",
  "ActionSheetIOS",
  "LogBox",
  "Easing",
  "I18nManager",
  "DeviceEventEmitter",
  "useColorScheme",
  "useWindowDimensions",
  // Native
  "NativeModules",
  "TurboModuleRegistry",
  "UIManager",
  "NativeEventEmitter",
  "NativeAppEventEmitter",
  "NativeComponentRegistry",
  "requireNativeComponent",
  // Additional
  "AppRegistry",
  "VirtualizedSectionList",
  "Touchable",
  "processColor",
  "findNodeHandle",
  "PlatformColor",
  "DynamicColorIOS",
  "Settings",
  "DeviceInfo",
  "useAnimatedValue",
  "RootTagContext",
  "ReactNativeVersion",
  "Systrace",
  "DevSettings",
  "Networking",
  "unstable_batchedUpdates",
  "registerCallableModule",
  "codegenNativeCommands",
  "codegenNativeComponent",
  "UTFSequence",
  "ProgressBarAndroid",
  "PushNotificationIOS",
  "NativeDialogManagerAndroid",
  "usePressability",
];

/** Names of all built-in presets that can be reconstructed in the worker. */
const BUILT_IN_PRESET_NAMES = new Set([
  "reanimated",
  "gestureHandler",
  "safeAreaContext",
  "navigation",
  "asyncStorage",
  "screens",
  "expo",
]);

/** Check if a value (or any nested value) contains functions. */
function containsFunctions(value: unknown, visited = new WeakSet()): boolean {
  if (typeof value === "function") return true;
  if (value === null || typeof value !== "object") return false;
  if (visited.has(value as object)) return false;
  visited.add(value as object);
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (containsFunctions(v, visited)) return true;
  }
  return false;
}

/**
 * Vitest plugin for React Native.
 *
 * Handles platform-specific module resolution, asset stubs, preset virtual
 * modules, and automatic setup-file injection so tests can run against
 * React Native code in a Node/JSDOM environment.
 */
export function reactNative(options?: VitestNativeOptions): Plugin {
  // --- Validate options eagerly so users get fast, clear errors ---

  if (options?.presets) {
    for (const preset of options.presets) {
      if (!BUILT_IN_PRESET_NAMES.has(preset.name)) {
        throw new Error(
          `[vitest-native] Unknown preset "${preset.name}". ` +
            `Only built-in presets are supported: ${[...BUILT_IN_PRESET_NAMES].join(", ")}. ` +
            `For custom module mocking, use vi.mock() in a setup file.`,
        );
      }
    }
  }

  if (options?.mocks && containsFunctions(options.mocks)) {
    throw new Error(
      `[vitest-native] The "mocks" option contains function values, which cannot be ` +
        `transferred to Vitest worker processes. Only JSON-serializable values ` +
        `(strings, numbers, booleans, plain objects, arrays) are supported.\n\n` +
        `For function-based mock overrides, use vi.mock() in a setup file:\n\n` +
        `  // vitest.setup.ts\n` +
        `  import { vi } from 'vitest';\n` +
        `  vi.mock('react-native', async (importOriginal) => {\n` +
        `    const actual = await importOriginal();\n` +
        `    return { ...actual, Alert: { alert: vi.fn() } };\n` +
        `  });`,
    );
  }

  // These are populated in configResolved once we know the project root.
  let resolved: ResolvedOptions;
  const presetModules = new Map<string, () => Record<string, any>>();
  // Preset export names discovered by calling factories at config time.
  const presetExportNames = new Map<string, string[]>();
  let assetPattern: RegExp;

  // Resolve the setup file eagerly (it's relative to the plugin, not the consumer).
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  let setupFilePath = path.resolve(thisDir, "setup.mjs");
  if (!fs.existsSync(setupFilePath)) {
    const srcPath = path.resolve(thisDir, "setup.ts");
    if (fs.existsSync(srcPath)) {
      setupFilePath = srcPath;
    }
  }

  // Platform extensions can be computed eagerly.
  const platform = options?.platform ?? "ios";
  const diagnostics = options?.diagnostics ?? false;
  const extensions = getPlatformExtensions(platform);

  return {
    name: "vitest-native",
    enforce: "pre",

    config(userConfig, _env) {
      // Serialize options that need to cross from the Vite main process
      // into Vitest worker processes. globalThis does NOT survive this
      // boundary — we use test.env to inject process.env vars instead.
      //
      // Resolve the project root using the same logic as Vite:
      // path.resolve(userConfig.root) if set, else process.cwd().
      // This must happen here (not configResolved) because test.env
      // is captured before configResolved runs.
      const resolvedRoot = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
      const env: Record<string, string> = {
        VITEST_NATIVE_PLATFORM: platform,
        VITEST_NATIVE_DIAGNOSTICS: String(diagnostics),
        VITEST_NATIVE_PROJECT_ROOT: resolvedRoot,
      };

      // Custom mock overrides (validated above to be serializable).
      if (options?.mocks && Object.keys(options.mocks).length > 0) {
        env.VITEST_NATIVE_MOCKS = JSON.stringify(options.mocks);
      }

      // If user explicitly provided presets, serialize their names so
      // setup.ts knows not to auto-detect. If omitted, setup.ts will
      // auto-detect from the worker context.
      if (options?.presets) {
        env.VITEST_NATIVE_PRESET_NAMES = JSON.stringify(options.presets.map((p) => p.name));
      }

      return {
        resolve: {
          extensions,
          conditions: ["react-native"],
        },
        test: {
          setupFiles: [setupFilePath],
          env,
        },
      };
    },

    async configResolved(config) {
      // Now we have the real project root — resolve options from consumer context.
      resolved = await resolveOptions(options, config.root);

      // Build preset module lookup and read static export names.
      // Export names are declared statically on each preset module so they
      // can be read at Vite config time without calling the factory (which
      // requires vitest, only available in worker processes).
      for (const preset of resolved.presets) {
        for (const [moduleName, presetModule] of Object.entries(preset.modules)) {
          presetModules.set(moduleName, presetModule.factory);
          presetExportNames.set(moduleName, presetModule.exports);
        }
      }

      // Build the asset regex from the resolved extensions list.
      assetPattern = new RegExp(`\\.(${resolved.assetExts.join("|")})$`);
    },

    resolveId(source) {
      // Redirect react-native root import to a virtual module.
      // The real mock is wired up by vi.mock() in the setup file.
      if (source === "react-native") {
        return "\0virtual:react-native";
      }

      // Redirect react-native subpath imports (e.g. react-native/Libraries/...).
      if (source.startsWith("react-native/")) {
        return `\0virtual:rn-subpath:${source}`;
      }

      // Redirect preset-provided modules to virtual stubs.
      if (presetModules.has(source)) {
        return `\0virtual:preset:${source}`;
      }

      return undefined;
    },

    load(id) {
      // The root react-native module — re-export nothing.
      // vi.mock('react-native') in setup.ts provides the actual mock.
      if (id === "\0virtual:react-native") {
        return "export default {};";
      }

      // Subpath imports (react-native/Libraries/*, react-native/jest-preset, etc.)
      // Re-export everything from the root mock stored on globalThis by setup.ts.
      // By the time test code evaluates these, setup.ts has already run.
      if (id.startsWith("\0virtual:rn-subpath:")) {
        return [
          `const _rn = globalThis.__vitest_native_mock || {};`,
          ...RN_EXPORT_NAMES.map((n) => `export const ${n} = _rn['${n}'];`),
          `export default _rn;`,
        ].join("\n");
      }

      // Preset virtual modules — serve named exports from the runtime mock
      // stored on globalThis by setup.ts. The export names are discovered
      // at config time by calling the preset factory.
      if (id.startsWith("\0virtual:preset:")) {
        const moduleName = id.slice("\0virtual:preset:".length);
        const exportNames = presetExportNames.get(moduleName) || [];
        return [
          `const _m = (globalThis.__vitest_native_preset_mocks || {})['${moduleName}'] || {};`,
          ...exportNames.map((n) => `export const ${n} = _m['${n}'];`),
          `export default _m;`,
        ].join("\n");
      }

      // Stub binary/font/media asset imports with their basename string,
      // matching React Native's packager behaviour.
      const fsPath = stripFsPrefix(id);
      if (assetPattern.test(fsPath)) {
        const basename = fsPath.split("/").pop() ?? fsPath;
        return `export default "${basename}";`;
      }

      return undefined;
    },
  };
}
