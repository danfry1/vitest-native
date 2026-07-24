import type { Plugin, UserConfig } from "vite";
import type { PoolRunnerInitializer } from "vitest/node";
import type { VitestNativeOptions, ResolvedOptions, Preset } from "./types.js";
import { getPlatformExtensions } from "./resolve.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import flowRemoveTypes from "flow-remove-types";
import { validateOptions, validatePeerDependency, warnUnknownOptions } from "./validate.js";
import { PEER_REQUIREMENTS } from "./peer-requirements.js";
import { nativeEngineConfig, type JsxTransformConfig } from "./native/apply.js";
import { detectEngine } from "./native/detect.js";
import { detectEcosystemPackages } from "./native/ecosystem.js";

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

async function autoDetectPresets(diagnostics: boolean, projectRoot: string): Promise<Preset[]> {
  const detected: Preset[] = [];
  const enabled = new Set<string>();
  // Lazy import avoids pulling vitest into the Vite main process at module
  // load time. The presets module imports vi from vitest at the top level,
  // which is only safe inside Vitest worker processes. Dynamic import()
  // defers this until configResolved, where Vitest is initialized.
  const presetFactories = (await import("./presets/index.js")) as Record<string, unknown>;

  // Single require instance for all package checks — avoids creating one per package.
  const req = createRequire(path.join(projectRoot, "package.json"));

  for (const [pkgName, exportName] of Object.entries(AUTO_DETECT_PRESETS)) {
    let installed = false;
    try {
      req.resolve(pkgName);
      installed = true;
    } catch {}
    if (installed) {
      if (enabled.has(exportName)) continue;
      const factory = presetFactories[exportName];
      if (typeof factory === "function") {
        detected.push(factory());
        enabled.add(exportName);
        if (diagnostics) {
          console.log(`[vitest-native] Auto-detected ${pkgName} → enabled ${exportName} preset`);
        }
      }
    } else if (diagnostics) {
      console.log(`[vitest-native] Checked for ${pkgName}: not found, skipping preset`);
    }
  }
  return detected;
}

function resolvePackageVersion(packageName: string, projectRoot: string): string | null {
  const req = createRequire(path.join(projectRoot, "package.json"));
  try {
    return (req(`${packageName}/package.json`) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

/**
 * One line, once per process, stating which engine this run actually uses.
 * Tests pass either way; a team that believes it's exercising real React Native
 * while running the mock (or vice versa) must be able to see it in every log.
 * Guarded via globalThis (like the require-hook install) so workspace setups
 * that call config() per project print it once.
 *
 * Written to stderr: this is the plugin's only unconditional output, and stdout
 * must stay parseable for pipelines like `vitest --reporter=json > results.json`.
 */
function printEngineBanner(engine: "mock" | "native", platform: string, projectRoot: string): void {
  const g = globalThis as { __vitest_native_banner_printed?: boolean };
  if (g.__vitest_native_banner_printed) return;
  g.__vitest_native_banner_printed = true;
  if (engine === "native") {
    const rn = resolvePackageVersion("react-native", projectRoot);
    console.error(
      `[vitest-native] engine: native — real react-native${rn ? `@${rn}` : ""} (platform ${platform})`,
    );
  } else {
    console.error(
      `[vitest-native] engine: mock — React Native reimplementation, cross-checked against real RN (platform ${platform})`,
    );
  }
}

function getJsxTransformConfig(projectRoot: string): JsxTransformConfig {
  const viteVersion = resolvePackageVersion("vite", projectRoot);
  const viteMajor = Number(viteVersion?.split(".")[0]);
  return viteMajor >= 8
    ? { oxc: { jsx: { runtime: "automatic" } } }
    : { esbuild: { jsx: "automatic" } };
}

/**
 * The names React Native's index exports.
 *
 * They cannot be read with a normal import: the index is Flow source, and its
 * exports are lazy getters that neither a bundler nor cjs-module-lexer can see.
 * They also cannot be read by requiring the module here — that would execute React
 * Native inside the Vite process, before any of the engine's globals exist.
 *
 * So they are parsed out of the `module.exports = { … }` object literal, whose
 * members sit at one indentation level. React Native uses three member shapes
 * there: lazy getters (`get View() {`), method shorthand
 * (`unstable_batchedUpdates<T>(fn) {`), and plain properties (`Systrace: …`).
 * A name missed here surfaces immediately as "does not provide an export named X"
 * rather than silently, and the facade's export surface is asserted against the
 * real module in the native suite, across every React Native version in CI.
 */
export function parseReactNativeExports(indexSource: string): string[] {
  const start = indexSource.indexOf("module.exports = {");
  if (start === -1) return [];
  const body = indexSource.slice(start);
  const names = new Set<string>();
  for (const match of body.matchAll(
    /^ {2}(?:get\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*[(:,]/gm,
  )) {
    const name = match[1];
    if (name !== "default" && name !== "__esModule" && name !== "get") names.add(name);
  }
  return [...names];
}

/**
 * Build (or reuse) the precompiled React Native registry for a project.
 *
 * The builder ships as runtime `.mjs` next to this file (it is also imported by the
 * native setup file, which Node loads directly), so it is reached through a computed
 * dynamic import rather than a static one — a static specifier would bundle a second
 * copy into the plugin entry. Returns the registry path, or null when one could not
 * be produced, in which case the engine keeps loading RN file by file.
 */
async function buildRegistryFor(options: {
  projectRoot: string;
  platform: string;
  reactNativeVersion: string;
  assetExts: string[];
  diagnostics: boolean;
}): Promise<string | null> {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const module = (await import(pathToFileURL(path.resolve(dir, "native/registry.mjs")).href)) as {
      buildRegistry: (o: typeof options) => string | null;
    };
    return module.buildRegistry(options);
  } catch (error) {
    if (options.diagnostics) {
      console.warn(
        `[vitest-native] could not precompile the React Native registry ` +
          `(${(error as Error)?.message}); using per-file module loading.`,
      );
    }
    return null;
  }
}

/**
 * Compile one inlined ecosystem file with the project's React Native Babel preset.
 *
 * The transformer ships as runtime `.mjs` (Node's loader hooks use it too), so it is
 * loaded through a computed path rather than a static import, and synchronously —
 * Vite's transform hook may be sync and the module is already resident by the time
 * any file reaches this point.
 */
let ecosystemTransformer: ((f: string, c: string, r: string, p: string) => string) | null = null;
function transformEcosystem(
  file: string,
  code: string,
  projectRoot: string,
  platform: string,
): string {
  if (!ecosystemTransformer) {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const mod = createRequire(import.meta.url)(path.resolve(dir, "native/transform.mjs")) as {
      transformRN: (f: string, c: string, r: string, p: string) => string;
    };
    ecosystemTransformer = mod.transformRN;
  }
  return ecosystemTransformer(file, code, projectRoot, platform);
}

/**
 * Vite 6/7 and Vite 8 expose mutually exclusive JSX config types:
 * `esbuild.jsx` before Vite 8 and `oxc.jsx` from Vite 8 onward. The runtime
 * version check above guarantees that only the matching shape is returned,
 * but a build against any single Vite major cannot type the other major's
 * valid config. Keep that unavoidable assertion at this compatibility edge.
 */
function asCompatibleViteConfig(config: object): Omit<UserConfig, "plugins"> {
  return config as unknown as Omit<UserConfig, "plugins">;
}

/**
 * Synchronously resolve the export-names of presets whose package is installed.
 * Used by the native-engine config path (which can't await the factory imports)
 * to tell the native setup file which preset mocks to build. Returns deduped
 * preset names (e.g. ["reanimated", "navigation"]).
 */
function autoDetectPresetNames(projectRoot: string, diagnostics: boolean): string[] {
  const req = createRequire(path.join(projectRoot, "package.json"));
  const names = new Set<string>();
  for (const [pkgName, exportName] of Object.entries(AUTO_DETECT_PRESETS)) {
    try {
      req.resolve(pkgName);
      names.add(exportName);
      if (diagnostics) {
        console.log(`[vitest-native] Auto-detected ${pkgName} → enabled ${exportName} preset`);
      }
    } catch {
      if (diagnostics) {
        console.log(`[vitest-native] Checked for ${pkgName}: not found, skipping preset`);
      }
    }
  }
  return [...names];
}

async function resolveOptions(
  options: VitestNativeOptions = {},
  projectRoot?: string,
): Promise<ResolvedOptions> {
  const platform = options.platform ?? "ios";
  const diagnostics = options.diagnostics ?? false;
  const engine: "mock" | "native" = options.engine === "native" ? "native" : "mock";
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
    engine,
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
  "EventEmitter",
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
  "useAnimatedValueXY",
  "useAnimatedColor",
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

/** Fast membership check for leaf-name lookups on subpath imports. */
const RN_EXPORT_NAME_SET = new Set(RN_EXPORT_NAMES);

/**
 * The bare package name of an import specifier ("@scope/pkg/sub" → "@scope/pkg",
 * "pkg/sub" → "pkg"). Mirrors native/match.mjs for the Vite-graph side.
 */
function packageNameOf(specifier: string): string {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

/**
 * The leaf module name a subpath import points at ("pkg/lib/Swipeable" or
 * "react-native/Libraries/Utilities/Platform.ios.js" → "Platform"), used to pick
 * the matching export off the mock. Mirrors native/match.mjs.
 */
function subpathLeafOf(specifier: string): string | null {
  const base = specifier.split("/").pop();
  if (!base) return null;
  return base.split(".")[0] || null;
}

/**
 * Deep entries of preset packages that are deliberately Node-safe and must NOT
 * be shadowed (test utilities and tooling entry points). Mirrors
 * native/match.mjs.
 */
const UTILITY_SUBPATH_LEAVES = new Set(["jest-utils", "jestSetup", "mock", "plugin"]);

function isUtilitySubpath(specifier: string): boolean {
  const leaf = subpathLeafOf(specifier);
  return leaf !== null && UTILITY_SUBPATH_LEAVES.has(leaf);
}

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

  if (options) {
    validateOptions(options as unknown as Record<string, unknown>);
    warnUnknownOptions(options as unknown as Record<string, unknown>);
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
  // Real on-disk path of react-native/package.json (mock engine): version-gate
  // reads must see the real manifest, not the virtualized mock.
  let realRnPackageJson: string | undefined;
  // Named exports the native engine's react-native facade re-exports, read from
  // the real index's own `get X()` declarations. null when the facade is not
  // available (React Native absent, or its index could not be read), in which case
  // the native engine leaves `react-native` externalized exactly as before.
  let rnFacadeExports: string[] | null = null;
  let rnFacadeRoot = "";
  // React Native packages the engine inlines and compiles itself (see
  // native/ecosystem.ts). Matched by path so the transform hook can recognise a
  // file as belonging to one.
  let ecosystemPattern: RegExp | null = null;
  let ecosystemRoot = "";

  // Caches for hot paths — resolveId and load are called for every import.
  const resolveCache = new Map<string, string | undefined>();
  const virtualCodeCache = new Map<string, string>();

  // Resolve the setup file eagerly (it's relative to the plugin, not the consumer).
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  let setupFilePath = path.resolve(thisDir, "setup.mjs");
  if (!fs.existsSync(setupFilePath)) {
    const srcPath = path.resolve(thisDir, "setup.ts");
    if (fs.existsSync(srcPath)) {
      setupFilePath = srcPath;
    }
  }

  // Native-engine setup file (shipped verbatim as dist/native/setup.mjs; the src
  // tree mirrors that layout so both built and source resolution find it here).
  const nativeSetupPath = path.resolve(thisDir, "native/setup.mjs");
  // Hot-runtime worker entry + runner (shipped verbatim alongside the setup file).
  const nativeWorkerPath = path.resolve(thisDir, "native/worker.mjs");
  const nativeRunnerPath = path.resolve(thisDir, "native/runner.mjs");

  // Platform extensions can be computed eagerly.
  const platform = options?.platform ?? "ios";
  const diagnostics = options?.diagnostics ?? false;
  // Capture the user-requested engine; concrete resolution happens in config().
  const requestedEngine = options?.engine ?? "auto";
  // Extra node_modules packages the native engine should transform (Flow/TS/JSX).
  const transformPkgs = (options?.transform ?? []).filter(
    (p) => typeof p === "string" && p.length > 0,
  );
  // Hot runtime (native engine only): persistent RN-hot workers with per-file
  // isolation via the custom pool. Opt-in while it bakes (see design doc).
  const hotRuntimeOpt = options?.hotRuntime ?? false;
  const hotRuntime = hotRuntimeOpt !== false;
  const hotRecycle = typeof hotRuntimeOpt === "object" ? hotRuntimeOpt : {};
  // Resolved at config() time, once the consumer project root is known. Seeded to a
  // safe default so the hooks (resolveId/load/transform), which run after config(),
  // never read undefined.
  let engine: "mock" | "native" = requestedEngine === "native" ? "native" : "mock";
  const extensions = getPlatformExtensions(platform);

  // Preset redirect shared by both engines: exact package match, or a subpath of
  // a preset package (pkg/Swipeable) — the real deep entry would pull in the
  // package's native runtime. Exempt: JSON subpaths (package.json version
  // gates), asset subpaths (fonts/images, stubbed from their real files), and
  // Node-safe utility entries (jest-utils, mock, plugin). The virtual id carries
  // the full specifier so load() can pick the mock export matching the leaf
  // module name. Subpath matching stays inert until configResolved has built
  // assetPattern — without it the asset exemption can't be applied.
  const resolvePresetId = (source: string): string | undefined => {
    if (presetModules.has(source)) return `\0virtual:preset:${source}`;
    if (!assetPattern) return undefined;
    if (source.endsWith(".json") || assetPattern.test(source) || isUtilitySubpath(source)) {
      return undefined;
    }
    const pkg = packageNameOf(source);
    if (pkg !== source && presetModules.has(pkg)) return `\0virtual:preset:${source}`;
    return undefined;
  };

  return {
    name: "vitest-native",
    enforce: "pre",

    async config(userConfig, _env) {
      // Serialize options that need to cross from the Vite main process
      // into Vitest worker processes. globalThis does NOT survive this
      // boundary — we use test.env to inject process.env vars instead.
      //
      // Resolve the project root using the same logic as Vite:
      // path.resolve(userConfig.root) if set, else process.cwd().
      // This must happen here (not configResolved) because test.env
      // is captured before configResolved runs.
      const resolvedRoot = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
      const jsxTransform = getJsxTransformConfig(resolvedRoot);
      // Resolve the concrete engine now that the project root is known. Default
      // (auto) prefers native when RN's Babel deps resolve; silently, with a notice
      // only when it must fall back to mock. See detect.ts / AUTO_PREFERS_NATIVE.
      const decision = detectEngine(requestedEngine, resolvedRoot);
      engine = decision.engine;
      // Explicit engine:'native' without its transform deps must fail HERE, at
      // config time — deferring lets the run start and die mid-suite inside the
      // loader with a stack that doesn't mention configuration at all.
      if (engine === "native" && !decision.nativeAvailable) {
        throw new Error(
          `[vitest-native] engine:'native' requires '@react-native/babel-preset' and ` +
            `'@babel/core' to resolve from ${resolvedRoot}. Install them as ` +
            `devDependencies (React Native projects ship them by default):\n\n` +
            `  npm install -D @react-native/babel-preset @babel/core\n\n` +
            `Or set engine:'mock' to run without a React Native install.`,
        );
      }
      // The fallback notice is a warning — a team that believes it is testing real
      // React Native while running the mock is the exact failure mode the engine
      // split exists to prevent.
      if (decision.notice) console.warn(decision.notice);
      printEngineBanner(engine, platform, resolvedRoot);
      const env: Record<string, string> = {
        VITEST_NATIVE_PLATFORM: platform,
        VITEST_NATIVE_DIAGNOSTICS: String(diagnostics),
        VITEST_NATIVE_PROJECT_ROOT: resolvedRoot,
      };
      const reactNativeVersion = resolvePackageVersion("react-native", resolvedRoot);
      if (reactNativeVersion) env.VITEST_NATIVE_RN_VERSION = reactNativeVersion;
      // Asset extensions for the Node require-hook to stub (matches the Vite-graph
      // asset stubbing): a CJS `require('./logo.png')` reaching Node's loader must
      // resolve to the basename string, not be compiled as JS.
      const assetExtList = [
        ...DEFAULT_ASSET_EXTS,
        ...(options?.assetExts ?? []).map((e) => e.replace(/^\./, "")),
      ];
      env.VITEST_NATIVE_ASSET_EXTS = JSON.stringify(assetExtList);
      if (hotRuntime && hotRecycle.preserveGlobals?.length) {
        env.VITEST_NATIVE_HOT_PRESERVE_GLOBALS = JSON.stringify(hotRecycle.preserveGlobals);
      }

      // Native engine: externalize RN so it loads through Node's single CJS graph,
      // where the native setup file's hooks Flow-strip it and mock the boundary.
      if (engine === "native") {
        if (options?.mocks && Object.keys(options.mocks).length > 0) {
          throw new Error(
            `[vitest-native] The "mocks" option is only supported by engine:'mock'. ` +
              `The native engine runs the real react-native module and cannot safely merge ` +
              `arbitrary exports into it. Use vi.mock() in a setup file, ` +
              `mockNativeModule() for native modules, or set engine:'mock'.`,
          );
        }
        // Third-party presets apply to the native engine too: native-runtime libs
        // (Reanimated worklets, gesture-handler natives) can't run in Node and must
        // be shadowed by the same self-contained mocks the mock engine uses. We
        // resolve which presets are active here (sync) and hand the names to the
        // native setup file via env; it builds the mocks in-worker. The actual
        // import redirection happens in resolveId/load (virtual:preset modules).
        const nativePresetNames = options?.presets
          ? options.presets.map((p) => p.name)
          : autoDetectPresetNames(resolvedRoot, diagnostics);
        if (nativePresetNames.length > 0) {
          env.VITEST_NATIVE_PRESET_NAMES = JSON.stringify(nativePresetNames);
        }
        // Per-preset config (e.g. navigation({ defaultRouteParams })) must travel to
        // the worker, where presets are rebuilt from their name. Only explicitly
        // configured presets carry config; auto-detected ones use their defaults.
        if (options?.presets) {
          const presetConfig: Record<string, Record<string, unknown>> = {};
          for (const p of options.presets) {
            if (p.config && Object.keys(p.config).length > 0) presetConfig[p.name] = p.config;
          }
          if (Object.keys(presetConfig).length > 0) {
            env.VITEST_NATIVE_PRESET_CONFIG = JSON.stringify(presetConfig);
          }
        }
        // Precompile React Native's require graph into a single file of lazy
        // factories, once per (RN version × platform × Babel toolchain), disk-cached
        // under node_modules/.cache. Every isolated test file then pays one read and
        // one compile instead of ~440. Built here, in the Vite main process, so the
        // cost is paid once per run rather than in every worker. A null result (RN
        // absent, unwritable cache, an unparseable graph) simply leaves the per-file
        // hooks in charge — the registry is an optimization, never a requirement.
        // Packages that declare React Native in their own manifest ship source Node
        // cannot run — untranspiled JSX, Flow, TypeScript — because they assume Metro
        // will compile them. Detect them and inline them, rather than making every
        // project rediscover the list one SyntaxError at a time.
        const ecosystem = detectEcosystemPackages(resolvedRoot, transformPkgs);
        if (ecosystem.length > 0) {
          ecosystemRoot = resolvedRoot;
          // Anchored on node_modules: a bare `[/\\]name[/\\]` match also hits any
          // directory that happens to share the package's name — a project folder
          // called `expo` made every file under it, including this package's own
          // runtime, look like ecosystem source. Every layout that matters keeps the
          // package under node_modules, including the pnpm and bun content stores.
          ecosystemPattern = new RegExp(
            `[\\\\/]node_modules[\\\\/](?:${ecosystem
              .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
              .join("|")})[\\\\/]`,
          );
          if (diagnostics) {
            console.log(`[vitest-native] inlining React Native packages: ${ecosystem.join(", ")}`);
          }
        }

        const registryFile = await buildRegistryFor({
          projectRoot: resolvedRoot,
          platform,
          reactNativeVersion: reactNativeVersion ?? "0.0.0",
          assetExts: assetExtList,
          diagnostics,
        });
        if (registryFile) env.VITEST_NATIVE_RN_REGISTRY = registryFile;

        // Lazy import: pulls in vitest/node, which only exists when running
        // under Vitest (not plain Vite) — and only the hot runtime needs it.
        let hot: { pool: PoolRunnerInitializer; runnerPath: string } | undefined;
        if (hotRuntime) {
          const { nativePool, defaultHotMemoryLimit } = await import("./native/pool.js");
          // When hot is enabled but the user set no explicit recycling, apply a
          // default per-worker memory bound so enabling hot can't grow memory
          // unbounded. Don't override an explicit choice: if the user set
          // recycleAfterFiles, respect that as their bound and add no default
          // memoryLimit. (Single-worker hot can't recycle regardless — the pool
          // warns about that — but multi-worker runs are now bounded out of the box.)
          const memoryLimit =
            hotRecycle.memoryLimit ??
            (hotRecycle.recycleAfterFiles == null ? defaultHotMemoryLimit() : undefined);
          hot = {
            pool: nativePool({
              workerEntry: nativeWorkerPath,
              projectRoot: resolvedRoot,
              recycleAfterFiles: hotRecycle.recycleAfterFiles,
              memoryLimit,
              diagnostics,
            }),
            runnerPath: nativeRunnerPath,
          };
        }
        const userPool = (userConfig as { test?: { pool?: unknown } }).test?.pool;
        // The VM pools run test code in a `vm` context whose module executor does not
        // go through Node's loader, and `module.register()` — how the engine installs
        // the ESM hook that Flow-strips React Native and resolves its platform files —
        // throws there outright ("register is not available when running in Vitest").
        // Without those hooks React Native never resolves its `.ios`/`.android` files
        // and dies on `Platform.OS` deep inside NativeEventEmitter. Say so here rather
        // than let that surface as an unexplained crash.
        if (userPool === "vmThreads" || userPool === "vmForks") {
          throw new Error(
            `[vitest-native] engine:'native' cannot run on the '${userPool}' pool. React Native is ` +
              `loaded through Node's module hooks, which a VM pool's context does not use — ` +
              `React Native fails to resolve its platform files there. Use 'threads' (the ` +
              `default) or 'forks', or switch to engine:'mock', which needs no hooks.`,
          );
        }
        if (hot && userPool) {
          console.warn(
            `[vitest-native] 'hotRuntime' supplies its own pool, overriding the configured ` +
              `pool '${typeof userPool === "string" ? userPool : "(custom)"}'.`,
          );
        }
        return asCompatibleViteConfig(
          nativeEngineConfig(
            nativeSetupPath,
            env,
            extensions,
            transformPkgs,
            hot,
            jsxTransform,
            userPool,
            ecosystem,
            resolvedRoot,
          ),
        );
      }

      // --- mock engine (existing behaviour) ---
      if (hotRuntime) {
        console.warn(
          `[vitest-native] 'hotRuntime' only applies to engine:'native' (resolved engine: '${engine}'); ignoring.`,
        );
      }
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

      return asCompatibleViteConfig({
        // Match RN's Babel preset: automatic JSX runtime, so app/test files using
        // JSX without importing React compile to `react/jsx-runtime` rather than
        // `React.createElement` ("React is not defined").
        ...jsxTransform,
        resolve: {
          extensions,
          conditions: ["react-native"],
          // Single React instance across test code, the mock, and the renderer —
          // avoids a null hooks dispatcher from duplicate react copies in some
          // consumer projects (e.g. mock FlatList's useImperativeHandle).
          dedupe: ["react", "react-test-renderer", "test-renderer", "react-is"],
        },
        test: {
          setupFiles: [setupFilePath],
          env,
        },
      });
    },

    async configResolved(config) {
      // Validate peer dependencies (table shared with the CLI's doctor command).
      const peerErrors: string[] = [];
      for (const { name, minimum, maximumMajor, minimumByMajor } of PEER_REQUIREMENTS) {
        const error = validatePeerDependency(
          name,
          minimum,
          config.root,
          maximumMajor,
          minimumByMajor,
        );
        if (error) peerErrors.push(error);
      }
      if (peerErrors.length > 0) {
        throw new Error(
          `[vitest-native] Unsupported peer dependencies:\n- ${peerErrors.join("\n- ")}`,
        );
      }

      // Check optional RNTL version
      const rntlError = validatePeerDependency(
        "@testing-library/react-native",
        "12.0.0",
        config.root,
        15,
      );
      if (rntlError && !rntlError.includes("not found")) {
        console.warn(`[vitest-native] ${rntlError}`);
      }

      // Now we have the real project root — resolve options from consumer context.
      resolved = await resolveOptions(options, config.root);
      try {
        realRnPackageJson = createRequire(path.join(config.root, "package.json")).resolve(
          "react-native/package.json",
        );
      } catch {
        // RN not installed (mock engine works without it) — keep virtualizing.
      }
      // The authoritative engine is the one decided in config(); keep ResolvedOptions in sync.
      resolved.engine = engine;

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

      // Read the facade's export list from React Native's own index.
      if (engine === "native") {
        rnFacadeRoot = config.root;
        try {
          const indexPath = createRequire(path.join(config.root, "package.json")).resolve(
            "react-native",
          );
          const names = parseReactNativeExports(fs.readFileSync(indexPath, "utf8"));
          rnFacadeExports = names.length > 0 ? names : null;
        } catch {
          // React Native not resolvable — keep `react-native` externalized.
          rnFacadeExports = null;
        }
      }

      // Build the asset regex from the resolved extensions list. Extensions are
      // escaped (user-supplied entries may contain regex metacharacters) and the
      // match is case-insensitive ("LOGO.PNG" is an asset too — the native
      // loader already lowercases; the engines must agree).
      const escaped = resolved.assetExts.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      assetPattern = new RegExp(`\\.(${escaped.join("|")})$`, "i");
    },

    resolveId(source, importer) {
      // Native engine: React Native itself still lives in Node's CJS graph, but the
      // app/test graph reaches it through a facade module (see load()) so Vitest
      // owns the module id and vi.mock('react-native') can intercept it. Third-party
      // preset modules (Reanimated, etc.) are redirected to virtual mocks as under
      // the mock engine — their native runtimes cannot load in Node.
      if (engine === "native") {
        if (source === "react-native" && rnFacadeExports !== null) {
          return "\0virtual:rn-facade";
        }
        return resolvePresetId(source);
      }

      // Redirect react-native root import to a virtual module.
      // The real mock is wired up by vi.mock() in the setup file.
      if (source === "react-native") {
        return "\0virtual:react-native";
      }

      // Redirect react-native subpath imports (e.g. react-native/Libraries/...).
      // The package manifest is exempt: `require('react-native/package.json').version`
      // is a common version gate and must read the real file, not the mock.
      if (source.startsWith("react-native/")) {
        if (source === "react-native/package.json" && realRnPackageJson) {
          return realRnPackageJson;
        }
        return `\0virtual:rn-subpath:${source}`;
      }

      // Redirect preset-provided modules (and their subpaths) to virtual stubs.
      const presetId = resolvePresetId(source);
      if (presetId) {
        return presetId;
      }

      // Layer 1: Metro-compatible extensionless resolution for node_modules.
      // Many RN-ecosystem packages use extensionless imports internally
      // (e.g. './utils' meaning './utils.js'). Metro resolves these natively,
      // but Vite doesn't apply resolve.extensions inside node_modules.
      // Try appending platform extensions in priority order.
      if (
        importer &&
        importer.includes("node_modules") &&
        source.startsWith(".") &&
        !path.extname(source)
      ) {
        const cacheKey = `${importer}\0${source}`;
        const cached = resolveCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const importerDir = path.dirname(importer);
        const absolute = path.resolve(importerDir, source);

        // Try as a file with extensions
        for (const ext of extensions) {
          const candidate = absolute + ext;
          if (fs.existsSync(candidate)) {
            resolveCache.set(cacheKey, candidate);
            return candidate;
          }
        }

        // Try as a directory with index file
        for (const ext of extensions) {
          const candidate = path.join(absolute, `index${ext}`);
          if (fs.existsSync(candidate)) {
            resolveCache.set(cacheKey, candidate);
            return candidate;
          }
        }

        // Cache misses too to avoid re-scanning the filesystem.
        resolveCache.set(cacheKey, undefined);
      }

      return undefined;
    },

    load(id) {
      // The native engine's react-native facade. It re-exports the SAME instance
      // Node's graph holds — `_rn.View` is the very object an externalized library
      // sees — so nothing about React Native's behaviour or identity changes. What
      // changes is ownership of the module id: because the app/test graph now
      // imports a module Vitest resolved, `vi.mock('react-native', …)` and
      // `importOriginal()` work under the native engine, which is the single most
      // common thing a migrating Jest suite reaches for.
      //
      // Reading each name off the index runs React Native's lazy getters eagerly.
      // That is not a new cost: Node already materialises every detected named
      // export when an ESM import consumes a CommonJS module, which is how this
      // import resolved before.
      if (id === "\0virtual:rn-facade" && rnFacadeExports !== null) {
        const cached = virtualCodeCache.get(id);
        if (cached) return cached;
        const code = [
          `import { createRequire } from "node:module";`,
          `const _rn = createRequire(${JSON.stringify(
            path.join(rnFacadeRoot, "package.json"),
          )})("react-native");`,
          ...rnFacadeExports.map((n) => `export const ${n} = _rn[${JSON.stringify(n)}];`),
          `export default _rn;`,
        ].join("\n");
        virtualCodeCache.set(id, code);
        return code;
      }

      // Preset virtual modules — served for BOTH engines. Under native this is the
      // only virtualization (react-native itself loads from Node's CJS graph). The
      // generated module reads named exports from the runtime mock stored on
      // globalThis by the (mock or native) setup file.
      if (id.startsWith("\0virtual:preset:")) {
        const cached = virtualCodeCache.get(id);
        if (cached) return cached;

        const specifier = id.slice("\0virtual:preset:".length);
        const pkg = packageNameOf(specifier);
        const exportNames = presetExportNames.get(pkg) || [];
        // Subpath imports (pkg/lib/Swipeable) get the mock export matching the
        // leaf module name as their default — real deep entries export that one
        // thing. Root imports honor a factory-provided default (e.g. svg's Svg
        // component), falling back to the namespace object when the mock has
        // none; unknown leaves warn under diagnostics since the namespace
        // default is usually not what the importer wanted.
        const leaf = specifier === pkg ? null : subpathLeafOf(specifier);
        const fallback = `('default' in _m ? _m['default'] : _m)`;
        const code = [
          `const _m = (globalThis.__vitest_native_preset_mocks || {})[${JSON.stringify(pkg)}] || {};`,
          ...exportNames.map((n) => `export const ${n} = _m['${n}'];`),
          ...(leaf
            ? [
                `const _hit = ${JSON.stringify(leaf)} in _m;`,
                `if (!_hit && process.env.VITEST_NATIVE_DIAGNOSTICS === "true") console.warn(${JSON.stringify(
                  `[vitest-native] '${specifier}' has no matching export on the '${pkg}' preset mock; serving the root mock namespace.`,
                )});`,
                `export default (_hit ? _m[${JSON.stringify(leaf)}] : ${fallback});`,
              ]
            : [`export default ${fallback};`]),
        ].join("\n");
        virtualCodeCache.set(id, code);
        return code;
      }

      // Asset imports have the same stable semantics under both engines.
      // JSON.stringify the basename — filenames can contain quotes/backslashes,
      // and raw interpolation would emit broken JS (same hazard class as the
      // native loader, which already stringifies).
      const fsPath = stripFsPrefix(id);
      if (assetPattern.test(fsPath)) {
        const basename = fsPath.split("/").pop() ?? fsPath;
        return `export default ${JSON.stringify(basename)};`;
      }

      // Native engine serves RN from Node's CJS graph — nothing else to load here.
      if (engine === "native") return undefined;

      // The root react-native module. In a normal run setup.ts's
      // vi.mock('react-native') intercepts this id and serves the mock directly, so
      // this source is never evaluated. It matters when a TEST registers its own
      // vi.mock('react-native', …): that replaces setup's registration, and the
      // factory's importOriginal() then resolves to THIS module. Re-exporting the
      // runtime mock is what makes the usual spread-and-override form work —
      // otherwise `{ ...(await importOriginal()) }` spreads nothing and every export
      // the test did not name disappears.
      if (id === "\0virtual:react-native") {
        const cacheKey = "\0rn-root";
        let code = virtualCodeCache.get(cacheKey);
        if (!code) {
          code = [
            `const _rn = globalThis.__vitest_native_mock || {};`,
            ...RN_EXPORT_NAMES.map((n) => `export const ${n} = _rn['${n}'];`),
            `export default _rn;`,
          ].join("\n");
          virtualCodeCache.set(cacheKey, code);
        }
        return code;
      }

      // Subpath imports (react-native/Libraries/*, react-native/jest-preset, etc.)
      // Re-export everything from the root mock stored on globalThis by setup.ts.
      // By the time test code evaluates these, setup.ts has already run.
      // The default export is the mock export matching the leaf module name —
      // `import Platform from 'react-native/Libraries/Utilities/Platform'` must
      // yield Platform, not the whole mock. Unknown leaves fall back to the root
      // mock. Code only varies by leaf, so it's cached per leaf.
      if (id.startsWith("\0virtual:rn-subpath:")) {
        const subpath = id.slice("\0virtual:rn-subpath:".length);
        const leaf = subpathLeafOf(subpath);
        const known = leaf && RN_EXPORT_NAME_SET.has(leaf) ? leaf : null;
        const cacheKey = `\0rn-subpath:${known ?? ""}`;
        let code = virtualCodeCache.get(cacheKey);
        if (!code) {
          code = [
            `const _rn = globalThis.__vitest_native_mock || {};`,
            ...RN_EXPORT_NAMES.map((n) => `export const ${n} = _rn['${n}'];`),
            known ? `export default _rn[${JSON.stringify(known)}];` : `export default _rn;`,
          ].join("\n");
          virtualCodeCache.set(cacheKey, code);
        }
        return code;
      }

      // Stub binary/font/media asset imports with their basename string,
      // matching React Native's packager behaviour.
      return undefined;
    },

    transform(code, id) {
      // Native engine: React Native itself is Flow-stripped in Node's loader hooks,
      // not here. The auto-inlined ecosystem packages are the exception — they live
      // in Vite's graph precisely so Vitest owns them, which means Vite's pipeline
      // has to be able to parse them, and it cannot: the ecosystem ships JSX and
      // Flow in `.js` files that Vite leaves alone inside node_modules. Compile them
      // with the project's own React Native Babel preset, the same transform the
      // Node hooks apply to everything else.
      if (engine === "native") {
        if (!ecosystemPattern || !ecosystemPattern.test(id)) return undefined;
        if (!/\.[cm]?[jt]sx?$/.test(id.split("?")[0])) return undefined;
        try {
          return { code: transformEcosystem(id, code, ecosystemRoot, platform), map: null };
        } catch (error) {
          // Leave the file untouched: Vite's own parse error names the real problem
          // better than a Babel failure on a file Babel may simply not own.
          if (diagnostics) {
            console.warn(
              `[vitest-native] could not compile inlined ${id} (${(error as Error)?.message}); ` +
                `serving it untouched.`,
            );
          }
          return undefined;
        }
      }

      // Flow-strip inlined node_modules sources whose path contains "react-native"
      // and that ship `@flow` — i.e. react-native-* ecosystem packages pulled into
      // the Vite graph. (NOT react-native itself: under the mock engine its imports
      // resolve to virtual modules via resolveId above and never reach here.) This
      // is the mock engine's only Flow-stripping for such inlined packages, since
      // Vite's own pipeline can't parse Flow.
      if (!id.includes("node_modules")) return undefined;
      if (!id.includes("react-native") || !id.endsWith(".js")) return undefined;
      if (!code.includes("@flow")) return undefined;

      // The filters above are heuristics — "@flow" can appear inside a string
      // or comment of a perfectly valid non-Flow file that flowRemoveTypes
      // then fails to parse. Skipping is strictly better than throwing: a
      // genuine Flow file that fails here would fail Vite's own parse next
      // with a clearer error, while a false positive passes through untouched.
      try {
        const stripped = flowRemoveTypes(code, { all: true });
        return {
          code: stripped.toString(),
          map: stripped.generateMap(),
        };
      } catch (e) {
        // Always visible (not diagnostics-gated): if this was a genuine Flow file,
        // the run is about to fail on Vite's own parse with no breadcrumb back to
        // this decision. One line here turns a mystery into a lead.
        console.warn(
          `[vitest-native] Flow strip skipped for ${id} (parse failed: ${(e as Error)?.message}); serving the file untouched.`,
        );
        return undefined;
      }
    },
  };
}
