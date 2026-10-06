import type { Plugin, UserConfig } from "vite";
import type { PoolRunnerInitializer } from "vitest/node";
import type { VitestNativeOptions, ResolvedOptions, Preset } from "./types.js";
import { getConfiguredPlatformExtensions, getPlatformExtensions } from "./resolve.js";
import { existsExact } from "./native/resolve.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import flowRemoveTypes from "flow-remove-types";
import { validateOptions, validatePeerDependency, warnUnknownOptions } from "./validate.js";
import { PEER_REQUIREMENTS } from "./peer-requirements.js";
import { VitestNativeError } from "./errors.mjs";
import { serializableAliases } from "./jest-compat/aliases.mjs";
import { tsconfigPathAliases } from "./native/tsconfig-paths.mjs";
import { nativeEngineConfig, type JsxTransformConfig } from "./native/apply.js";
import { detectEngine } from "./native/detect.js";
import { detectEcosystemPackages } from "./native/ecosystem.js";
import { containsPath, packageDirOf } from "./native/match.mjs";
import type { HotMemoryPlan } from "./native/memory.mjs";
import { workerVitestMismatch } from "./native/worker-vitest.js";
import type { NativeOwnershipPolicy } from "./native/ownership.mjs";
import {
  createNativeOwnershipPolicy,
  findNativeInlineConflicts,
  findNativeOwnershipConflict,
} from "./native/ownership.mjs";

function uniqueExtensions(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const extension = value.replace(/^\./, "").toLowerCase();
    if (extension && !seen.has(extension)) {
      seen.add(extension);
      result.push(extension);
    }
  }
  return result;
}

function assetExtensionsFor(
  sourceExts: readonly string[],
  metroAssets: readonly string[],
  user: readonly string[],
): string[] {
  const sources = new Set(sourceExts.map((extension) => extension.toLowerCase()));
  const automatic = uniqueExtensions(metroAssets).filter((extension) => !sources.has(extension));
  // Explicit user additions are last and authoritative. This preserves the
  // existing assetExts escape hatch even when a custom Metro profile classifies
  // the same suffix as source.
  return uniqueExtensions([...automatic, ...user]);
}

/** Strip Vite's /@fs/ prefix to get a real filesystem path. */
function stripFsPrefix(id: string): string {
  return id.startsWith("/@fs/") ? id.slice(4) : id;
}

import { AUTO_DETECT_PRESETS, DEFAULT_ASSET_EXTS, presetForInstalled } from "./preset-map.js";

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
    const installed = presetForInstalled(pkgName, req) !== null;
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
      console.log(
        `[vitest-native] Checked for ${pkgName}: not installed or tests itself, skipping preset`,
      );
    }
  }
  return detected;
}

/**
 * The directories a set of `test.include` globs point into, resolved against the run
 * root — the literal part of each pattern, up to its first wildcard.
 *
 * `packages/ui/src/**\/*.test.ts` names `packages/ui/src`, which is enough to know
 * the run's tests live in that package. `**\/*.test.ts` names nothing above the root
 * and is dropped: treating it as a hint would mark every workspace member as the
 * project and undo their detection entirely.
 */
export function testIncludeRoots(include: unknown, projectRoot: string): string[] {
  if (!Array.isArray(include)) return [];
  const dirs = new Set<string>();
  for (const pattern of include) {
    if (typeof pattern !== "string" || pattern.startsWith("!")) continue;
    const literal = pattern.slice(0, firstWildcard(pattern));
    const slash = literal.replace(/\\/g, "/").lastIndexOf("/");
    if (slash <= 0) continue; // Nothing above the root — no information.
    dirs.add(path.resolve(projectRoot, literal.slice(0, slash)));
  }
  return [...dirs];
}

/**
 * Where a glob stops being a literal path.
 *
 * `!`, `+` and `@` only introduce a pattern as part of an extglob — `@(a|b)` — and
 * are ordinary characters otherwise. Treating them as wildcards on their own cut
 * `packages/@scope/ui/**\/*.test.ts` down to `packages/`, which would have named the
 * whole workspace as the project and switched detection off for every member of it.
 */
function firstWildcard(pattern: string): number {
  const plain = pattern.search(/[*?[{]/);
  const extglob = pattern.search(/[!+@]\(/);
  if (plain === -1) return extglob === -1 ? pattern.length : extglob;
  return extglob === -1 ? plain : Math.min(plain, extglob);
}

/** The nearest directory at or above `from` holding a package.json, or null. */
function nearestPackageDir(from: string): string | null {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The `transform` option in either shape: an array of packages to compile, or an
 * object naming those and the ones to leave alone.
 *
 * `exclude` overrides everything — auto-detection, the closure walk, and the engine's
 * built-in toolchain and infrastructure lists. Those built-in lists are names the
 * engine learned from packages that broke, which means they are only ever as current
 * as the last release; `exclude` is the same decision, handed to the project.
 */
export function normalizeTransformOption(option: unknown): {
  include: string[];
  exclude: string[];
} {
  const names = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
  if (Array.isArray(option)) return { include: names(option), exclude: [] };
  if (option && typeof option === "object") {
    const shape = option as { include?: unknown; exclude?: unknown };
    const exclude = names(shape.exclude);
    // Excluding a package the same config also asks to transform is a contradiction;
    // the safer reading wins, since the cost of not compiling something is a legible
    // syntax error and the cost of compiling the wrong thing is a crash inside Babel.
    return { include: names(shape.include).filter((n) => !exclude.includes(n)), exclude };
  }
  return { include: [], exclude: [] };
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
 * Whether to resolve tsconfig `paths` the way Expo's Metro does. Expo CLI enables
 * tsconfig path aliases by default (`experiments.tsconfigPaths`, docs.expo.dev/guides/
 * typescript), and the SDK 57 template imports its own components through `@/…`, so
 * without this a new Expo project's first component test fails to resolve. Bare React
 * Native's Metro does not, so neither does this. Vite 8 resolves tsconfig paths itself
 * when `resolve.tsconfigPaths` is on; Vite 6 and 7 have no such option.
 *
 * Returns "enable" (Vite 8), "unsupported" (an older Vite with `paths` to resolve, worth
 * a warning), or null (not an Expo project, no tsconfig, opted out, or the user set
 * `resolve.tsconfigPaths` themselves).
 */
export function expoTsconfigPaths(
  projectRoot: string,
  userTsconfigPaths: unknown,
  viteMajor: number,
): "enable" | "unsupported" | null {
  if (userTsconfigPaths !== undefined) return null;
  const read = (file: string): string | null => {
    try {
      return fs.readFileSync(path.join(projectRoot, file), "utf8");
    } catch {
      return null;
    }
  };
  let manifest: { dependencies?: object; devDependencies?: object } = {};
  try {
    manifest = JSON.parse(read("package.json") ?? "{}");
  } catch {
    return null;
  }
  if (!("expo" in { ...manifest.dependencies, ...manifest.devDependencies })) return null;
  const tsconfig = read("tsconfig.json");
  if (tsconfig === null) return null;
  try {
    const app = JSON.parse(read("app.json") ?? "{}") as {
      expo?: { experiments?: { tsconfigPaths?: unknown } };
    };
    if (app.expo?.experiments?.tsconfigPaths === false) return null;
  } catch {
    // An unreadable app.json leaves Expo's default in place.
  }
  if (viteMajor >= 8) return "enable";
  return /"paths"\s*:/.test(tsconfig) ? "unsupported" : null;
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
function printEngineBanner(
  engine: "mock" | "native",
  platform: string,
  projectRoot: string,
  hotRuntime = false,
): void {
  const g = globalThis as { __vitest_native_banner_printed?: boolean };
  if (g.__vitest_native_banner_printed) return;
  g.__vitest_native_banner_printed = true;
  if (engine === "native") {
    const rn = resolvePackageVersion("react-native", projectRoot);
    // The runtime is named because it is chosen automatically: a test that passes
    // alone but fails after other files is the hot-runtime signal, and this is the
    // line that tells someone reading the log that it is in play.
    const runtime = hotRuntime ? ", hot runtime" : "";
    console.error(
      `[vitest-native] engine: native — real react-native${rn ? `@${rn}` : ""} (platform ${platform}${runtime})`,
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
  return parseReactNativeMembers(indexSource).map((member) => member.name);
}

/**
 * The members of React Native's index that announce their own deprecation.
 *
 * React Native marks a deprecated or extracted export by calling `warnOnce` inside
 * its getter, so reading the member is what prints the notice. The facade must not
 * read these while it initialises, or every file that imports `Pressable` prints
 * notices for `SafeAreaView`, `Clipboard` and the rest; it exposes them as getters
 * instead, and the notice appears only where a test really uses one.
 */
export function parseDeprecatedReactNativeExports(indexSource: string): string[] {
  return parseReactNativeMembers(indexSource)
    .filter((member) => member.deprecated)
    .map((member) => member.name);
}

function parseReactNativeMembers(indexSource: string): { name: string; deprecated: boolean }[] {
  const start = indexSource.indexOf("module.exports = {");
  if (start === -1) return [];
  // Only the object literal, which closes at the first unindented brace (`} as
  // ReactNativePublicAPI;`): code after it (`Object.defineProperty(module.exports,
  // …)` blocks) sits at the same indentation, and its keys are not members.
  const end = indexSource.slice(start).search(/^\}/m);
  const body = end === -1 ? indexSource.slice(start) : indexSource.slice(start, start + end);
  const matches = [...body.matchAll(/^ {2}(?:get\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*[(:,]/gm)];
  const members = new Map<string, boolean>();
  matches.forEach((match, i) => {
    const name = match[1];
    if (name === "default" || name === "__esModule" || name === "get") return;
    const text = body.slice(match.index, matches[i + 1]?.index ?? body.length);
    members.set(name, (members.get(name) ?? false) || /\bwarnOnce\s*\(/.test(text));
  });
  return [...members].map(([name, deprecated]) => ({ name, deprecated }));
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
  sourceExts: string[];
  diagnostics: boolean;
}): Promise<string | null> {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const module = (await import(
      pathToFileURL(path.resolve(dir, "native/registry-process.mjs")).href
    )) as {
      buildRegistryFor: (o: typeof options) => Promise<string | null>;
    };
    return module.buildRegistryFor(options);
  } catch (error) {
    try {
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const module = (await import(
        pathToFileURL(path.resolve(dir, "native/registry.mjs")).href
      )) as {
        _warnRegistryUnavailable: (reason: unknown) => void;
      };
      module._warnRegistryUnavailable((error as Error)?.message ?? error);
    } catch {
      // The registry module itself could not load, so its once-per-cause reporter
      // is unavailable. This last-resort warning must still make the performance
      // fallback visible regardless of diagnostics mode.
      console.warn(
        `[vitest-native] (native) could not precompile the React Native registry ` +
          `(${(error as Error)?.message ?? error}); using slower per-file module loading.`,
      );
    }
    return null;
  }
}

interface ProjectMetroProfile {
  framework: "expo" | "react-native" | "fallback";
  configPath: string | null;
  sourceExts: readonly string[];
  assetExts: readonly string[];
  resolverMainFields: readonly string[];
  conditionNames: readonly string[];
  customResolver: boolean;
  provenance: string;
}

/** Load declarative Metro data without retaining Metro/Expo in Vite's process. */
async function loadProjectMetroProfile(options: {
  projectRoot: string;
  platform: "ios" | "android";
  configFile?: string;
}): Promise<{ profile: ProjectMetroProfile; evidence: { durationMs?: number; rss?: number } }> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const module = (await import(
    pathToFileURL(path.resolve(dir, "native/metro-profile.mjs")).href
  )) as {
    loadMetroProfile: (input: typeof options) => Promise<{
      profile: ProjectMetroProfile;
      evidence: { durationMs?: number; rss?: number };
    }>;
  };
  return module.loadMetroProfile(options);
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
    if (presetForInstalled(pkgName, req) !== null) {
      names.add(exportName);
      if (diagnostics) {
        console.log(`[vitest-native] Auto-detected ${pkgName} → enabled ${exportName} preset`);
      }
    } else if (diagnostics) {
      console.log(
        `[vitest-native] Checked for ${pkgName}: not installed or tests itself, skipping preset`,
      );
    }
  }
  return [...names];
}

/**
 * `resolution` is the extension profile the plugin already settled on — Metro's when
 * metroConfig is on, the built-in one otherwise — so it is computed in one place.
 */
async function resolveOptions(
  options: VitestNativeOptions = {},
  projectRoot: string | undefined,
  resolution: { extensions: string[]; assetExts: string[] },
): Promise<ResolvedOptions> {
  const platform = options.platform ?? "ios";
  const diagnostics = options.diagnostics ?? false;
  const engine: "mock" | "native" = options.engine === "native" ? "native" : "mock";

  // An array replaces auto-detection; an object keeps it and switches named presets
  // off; omitting it auto-detects everything.
  let presets: Preset[];
  if (Array.isArray(options.presets)) {
    presets = options.presets;
  } else {
    const detected = await autoDetectPresets(diagnostics, projectRoot ?? process.cwd());
    const disabled = disabledPresetNames(options.presets);
    presets = disabled.size > 0 ? detected.filter((p) => !disabled.has(p.name)) : detected;
  }

  return {
    platform,
    engine,
    diagnostics,
    extensions: resolution.extensions,
    presets,
    mocks: options.mocks ?? {},
    assetExts: resolution.assetExts,
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
  "AssetRegistry",
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

/**
 * A file inside a React Native ecosystem package under node_modules — one whose
 * package NAME begins with `react-native` (with or without a scope, so
 * `@shopify/react-native-skia` counts), or whose scope begins with `@react-native`.
 *
 * The name must BEGIN with it, which is what separates this from the substring test
 * it replaced: `eslint-plugin-react-native` and a project directory called
 * `react-native-app` both contain the words without being React Native packages.
 */
/**
 * Two copies of React in one test process produce a null hooks dispatcher, which
 * surfaces as `Cannot read properties of null (reading 'use')` — usually wrapped by
 * React Native Testing Library as "Trying to detect host component names triggered the
 * following error", whose own advice is only that something is wrong with the
 * configuration. `resolve.dedupe` prevents it in the normal case; this reports the
 * cases dedupe cannot reach, such as a nested install, so the cause is named rather
 * than discovered.
 *
 * Pure and exported for testing: `resolve` is the resolver, so the check can be
 * exercised without building a broken node_modules tree.
 */
export function findDuplicateReact(
  resolve: (specifier: string, from: string) => string | null,
  projectRoot: string,
  consumers: string[],
): { projectCopy: string; otherCopy: string; consumer: string } | null {
  const projectCopy = resolve("react/package.json", projectRoot);
  if (!projectCopy) return null;
  for (const consumer of consumers) {
    const consumerRoot = resolve(`${consumer}/package.json`, projectRoot);
    if (!consumerRoot) continue;
    const otherCopy = resolve("react/package.json", consumerRoot);
    if (otherCopy && otherCopy !== projectCopy) {
      return { projectCopy, otherCopy, consumer };
    }
  }
  return null;
}

// A suite using top-level jest.mock() needs jestMockTransform() to hoist it. Without
// that plugin the call runs AFTER the imports it is meant to intercept, so the mock
// silently does not apply and the test fails comparing real output to expected mock
// output — with nothing pointing at the cause. Detected during transform and reported
// once, since the whole suite has the same fix.
const HAS_JEST_MOCK_CALL = /\bjest\s*\.\s*(?:mock|unmock|doMock|doUnmock)\s*\(/;
const RN_ECOSYSTEM_PATH =
  /[\\/]node_modules[\\/](?:@react-native[^\\/]*[\\/][^\\/]+|(?:@[^\\/]+[\\/])?react-native[^\\/]*)[\\/]/;

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
/**
 * Fields that select a different FORMAT of the same code — an ESM build beside a CJS
 * one. Vite prefers them, Node reads `main`, and the two builds are interchangeable,
 * so pointing Vite at `main` costs nothing and collapses the pair into one instance.
 *
 * `react-native` is deliberately NOT here. That field selects a different
 * IMPLEMENTATION — the native build rather than the web one — and Metro resolves it
 * ahead of `main`, so the engine must too (see tests-native/export-conditions.test.ts).
 * Aligning it downward would quietly load the web build, which is a fidelity
 * regression, not a deduplication. Packages using it stay split and are reported by
 * the duplicate-instance warning instead; fixing those means teaching Node to load
 * the native build, which needs the transform pipeline and is a separate change.
 */
const FORMAT_ONLY_FIELDS = ["module", "jsnext:main", "jsnext"] as const;

/**
 * Make Vite resolve a package to the same file Node will.
 *
 * The native engine runs two module systems. Vitest already forwards
 * `resolve.conditions` to the worker's Node (`--conditions react-native ...`), so a
 * package using an `exports` map resolves identically on both sides. Legacy
 * top-level fields have no such bridge: Vite reads `react-native`/`module`, Node
 * reads `main`, and a package publishing both ends up loaded twice with separate
 * module-level state. A store written through one copy reads back unset through the
 * other — silently, since nothing fails.
 *
 * Aligning downward, onto the file Node picks, is the direction that cannot break a
 * working suite: the `main` build is by definition something Node can execute,
 * whereas the `react-native` field usually points at untranspiled source that Node
 * cannot parse at all. Aligning upward would turn a wrong-value bug into a crash for
 * any package the engine does not also transform.
 *
 * Packages the engine itself virtualizes are left alone. Node-owned ecosystem
 * packages are intentionally not exempt: if Vite also reaches one, aligning a
 * format-only field to Node's file prevents a silent second instance.
 *
 * @returns the absolute file to use, or null to leave resolution alone
 */
export function alignLegacyFieldsWithNode(
  source: string,
  packageDirFor: (name: string) => string | null,
  readManifest: (dir: string) => Record<string, unknown> | null,
  resolveAsNodeWould: (name: string) => string | null,
  isEngineOwned: (name: string) => boolean,
): string | null {
  if (!source || source.startsWith(".") || source.startsWith("/") || source.startsWith("\0")) {
    return null;
  }
  const segments = source.split("/");
  const name = source.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
  // Subpath imports name a file directly, so both resolvers already agree.
  if (!name || segments.length > (source.startsWith("@") ? 2 : 1)) return null;
  // React Native itself is served through a facade and must not be redirected.
  // Everything else in node_modules is loaded by Node (see native/apply.ts), so the
  // alignment applies to ecosystem packages too: they used to be executed by Vite,
  // which is why this once skipped them, but they are Node-owned now and Vite
  // resolving their ESM build would recreate the very split this removes.
  if (isEngineOwned(name)) return null;

  const dir = packageDirFor(name);
  if (!dir) return null;
  const manifest = readManifest(dir);
  if (!manifest) return null;
  // An `exports` map is honoured by both resolvers, conditions included.
  if (manifest.exports !== undefined) return null;
  // A native build must win over `main`, exactly as it does under Metro.
  if (typeof manifest["react-native"] === "string") return null;

  const legacy = FORMAT_ONLY_FIELDS.map((f) => manifest[f]).find((v) => typeof v === "string");
  if (typeof legacy !== "string") return null;

  // Ask Node what it will actually load rather than joining `main` onto the package
  // directory. `main` is frequently a directory ("./lib") or extensionless, and
  // string-joining hands Vite a path that does not exist: the first version of this
  // did exactly that and took the whole test file down with "Cannot find module".
  // Node's resolver already applies directory/index and extension resolution, and it
  // is by definition the file the other module system will use.
  const nodeFile = resolveAsNodeWould(name);
  if (!nodeFile) return null;
  if (path.resolve(dir, legacy) === nodeFile) return null;
  return nodeFile;
}

/**
 * Preset names switched off by the object form of the `presets` option.
 *
 * The array form replaces auto-detection wholesale, which meant that turning ONE
 * preset off required listing every other detected preset by hand — tedious, and a
 * list that silently rots as dependencies change. The object form keeps detection
 * and names only what to drop.
 */
export function disabledPresetNames(presets: unknown): Set<string> {
  if (!presets || Array.isArray(presets) || typeof presets !== "object") return new Set();
  return new Set(
    Object.entries(presets as Record<string, unknown>)
      .filter(([, enabled]) => enabled === false)
      .map(([name]) => name),
  );
}

/**
 * Config-time reasons that make automatic hot selection unsafe. Suites migrated from
 * Jest (jestMockTransform(), the jest-compat setup) are not among them: the jest-compat
 * surface has its own cross-file isolation gate under hot (tests-native/hot-jest-compat)
 * and the hot runtime resets before user setup files run (tests-native/hot-user-setup).
 */
function hotAutoConfigDeclineReason(userPool: unknown, userIsolate: unknown): string | null {
  // An explicit isolation choice is the user's, in Vitest's terms: `true` asks for a
  // fresh worker per file, `false` for one module graph shared across files. The hot
  // runtime is neither, so 'auto' leaves Vitest's own semantics in charge.
  if (userIsolate !== undefined) {
    return `test.isolate is explicitly ${String(userIsolate)}`;
  }
  if (userPool != null) {
    const label = typeof userPool === "string" ? `'${userPool}'` : "a custom pool";
    return `${label} is explicitly configured`;
  }
  return null;
}

/**
 * Why the resolved Vitest config overrides a hot runtime chosen at config time, or
 * null. Vitest 4 applies CLI flags after plugins' config hooks, so `--maxWorkers=1`,
 * `--no-file-parallelism`, `--pool` and `--isolate`/`--no-isolate` arrive only in the
 * resolved config. `--no-isolate` sets the same `isolate: false` the hot runtime uses,
 * so it is read from the CLI options themselves.
 */
export function hotOverrideReason(
  resolved: { pool?: unknown; isolate?: unknown; maxWorkers?: unknown; fileParallelism?: unknown },
  cli: { isolate?: unknown },
  hotPool: unknown,
  // hotRuntime:{ allowUnboundedMemory: true } explicitly accepts a single worker, as
  // the config hook does; only an enforced memory plan needs two.
  singleWorkerAccepted = false,
): string | null {
  if (cli.isolate !== undefined) return `--${cli.isolate ? "" : "no-"}isolate was passed`;
  // Vitest resolves a pool initializer to its name, so the resolved config holds the
  // string "vitest-native", not the object the config hook returned.
  const poolName = (pool: unknown) =>
    typeof pool === "string"
      ? pool
      : pool !== null && typeof pool === "object"
        ? (pool as { name?: unknown }).name
        : undefined;
  const isHotPool =
    resolved.pool === hotPool ||
    (poolName(hotPool) !== undefined && poolName(resolved.pool) === poolName(hotPool));
  if (!isHotPool) {
    return `the pool '${typeof resolved.pool === "string" ? resolved.pool : "custom"}' was set`;
  }
  if (singleWorkerAccepted) return null;
  if (resolved.fileParallelism === false) return "file parallelism is off";
  if (typeof resolved.maxWorkers === "number" && resolved.maxWorkers < 2) {
    return `maxWorkers is ${resolved.maxWorkers}`;
  }
  return null;
}

/**
 * The root Vitest gives a project: `test.root` over Vite's `root` (Vitest 4 and 5's
 * resolveConfig). `vitest --root` arrives as `test.root`. Per-project state is keyed
 * by it, since that is the root configureVitest sees.
 */
export function vitestRootOf(config: { root?: unknown; test?: unknown }): string {
  const testRoot = (config.test as { root?: unknown } | undefined)?.root;
  const root = typeof testRoot === "string" && testRoot ? testRoot : config.root;
  return path.resolve(typeof root === "string" && root ? root : process.cwd());
}

/**
 * Pin each inline project's `root` to the root it would inherit anyway, so Vitest 5
 * resolves it through the config file with this plugin instead of sharing the
 * declaring config's Vite server. A server-sharing project gets its `test` options
 * from the user's raw config, captured before any plugin's config hook runs, so it
 * would miss everything this plugin contributes to `test` — setup files, dependency
 * ownership, env, the hot pool. Vitest shares a server only when an entry sets no
 * Vite-level option; `root` is one, and pinning it to the inherited value changes
 * nothing else. Unlike `sharedViteServer: false`, which Vitest reads from the
 * top-level config alone, this works in a nested config too. Vitest 4 resolves every
 * inline project through the config file already. Returns how many were pinned.
 */
export function pinInlineProjectRoots(test: unknown, declaringRoot: string): number {
  const projects = (test as { projects?: unknown } | undefined)?.projects;
  if (!Array.isArray(projects)) return 0;
  let pinned = 0;
  for (const entry of projects) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const project = entry as { root?: unknown };
    if (project.root !== undefined) continue;
    project.root = declaringRoot;
    pinned++;
  }
  return pinned;
}

/**
 * Run React Native's setup before the user's own setup files.
 *
 * Vite merges a config hook's returned arrays AFTER the user's (`mergeConfig`
 * concatenates left to right), so returning `setupFiles: [ours]` ran every user setup
 * file first. A user setup that imports `@testing-library/react-native` or
 * `react-native` then reached Node before the require hooks existed and failed on
 * React Native's Flow source ("Unexpected token 'typeof'"). The hot runtime hid this
 * by installing the hooks at worker boot; every other run broke. Jest has the same
 * ordering contract: a preset's `setupFiles` run before the project's
 * `setupFilesAfterEnv`. Moving the entry into the user's list (and out of the merged
 * result) keeps a single copy at the front.
 */
function prependSetupFile(userConfig: UserConfig, contributed: { setupFiles?: unknown }): void {
  const ours = (contributed.setupFiles as string[])[0];
  const userTest = ((userConfig as { test?: { setupFiles?: unknown } }).test ??= {});
  const existing = userTest.setupFiles;
  const userFiles = Array.isArray(existing) ? existing : existing == null ? [] : [existing];
  if (userFiles.length === 0) return;
  userTest.setupFiles = [ours, ...userFiles.filter((f) => f !== ours)];
  contributed.setupFiles = (contributed.setupFiles as string[]).slice(1);
}

function hasSetupFile(setupFiles: unknown, file: string): boolean {
  const real = (f: string) => {
    try {
      return fs.realpathSync(f);
    } catch {
      return path.resolve(f);
    }
  };
  const wanted = real(file);
  return (
    Array.isArray(setupFiles) && setupFiles.some((f) => typeof f === "string" && real(f) === wanted)
  );
}

type GroupedProject = {
  name?: string;
  config: {
    name?: unknown;
    maxWorkers?: unknown;
    isolate?: unknown;
    sequence?: { groupOrder?: unknown };
  };
};

/**
 * Why this project's worker count cannot coexist with another project's, or null.
 * Vitest schedules projects that share a `sequence.groupOrder` (0 unless set) as one
 * group, and throws when they resolve to different `maxWorkers` ("Projects … have
 * different 'maxWorkers' but same 'sequence.groupOrder'", groupSpecs in Vitest 4 and
 * 5). The hot runtime's memory plan caps workers (at most four), while a project
 * beside it gets Vitest's default of one fewer than the CPUs, so a native project next
 * to a mock or non-React-Native project failed on any machine with more than five
 * cores. Mirrors Vitest's resolveMaxWorkers and its grouping, including the exemption
 * for a single-worker isolated project in the default group.
 */
export function sharedGroupConflict(
  self: GroupedProject,
  others: readonly GroupedProject[],
  root: { maxWorkers?: unknown; watch?: boolean },
  cpus?: number,
): string | null {
  const order = (p: GroupedProject) => Number(p.config.sequence?.groupOrder ?? 0);
  const workers = (p: GroupedProject) =>
    (p.config.maxWorkers as number) ||
    (root.maxWorkers as number) ||
    vitestMaxWorkers(undefined, root.watch === true, cpus);
  const ownGroup = (p: GroupedProject) =>
    p.config.isolate === true && order(p) === 0 && p.config.maxWorkers === 1;
  for (const other of others) {
    if (other === self || ownGroup(other) || order(other) !== order(self)) continue;
    if (workers(other) !== workers(self)) {
      const name = String(other.name ?? other.config.name ?? "another project");
      return (
        `the project '${name}' is in the same sequence.groupOrder (${order(self)}) with ` +
        `${workers(other)} workers to this project's ${workers(self)}, which Vitest rejects ` +
        `(a distinct test.sequence.groupOrder runs them as separate groups)`
      );
    }
  }
  return null;
}

function isVmPool(pool: unknown): pool is "vmThreads" | "vmForks" {
  return pool === "vmThreads" || pool === "vmForks";
}

function vmPoolUnsupported(pool: string): VitestNativeError {
  return new VitestNativeError(
    "UNSUPPORTED_POOL",
    `engine:'native' cannot run on the '${pool}' pool. React Native is loaded through ` +
      `Node's module hooks, which a VM pool's context does not use — React Native fails to ` +
      `resolve its platform files there. Use 'threads' (the default) or 'forks', or switch ` +
      `to engine:'mock', which needs no hooks.`,
  );
}

function hotRuntimeOverridden(reason: string): VitestNativeError {
  return new VitestNativeError(
    "HOT_RUNTIME_OVERRIDDEN",
    `hotRuntime was requested, but ${reason}, which the hot runtime cannot honour. ` +
      `Remove that setting, or use hotRuntime:'auto' to fall back to it automatically ` +
      `or hotRuntime:false.`,
  );
}

/**
 * The worker count Vitest would have used had the hot runtime not capped it: the
 * user's own value (a count or a percentage of the CPUs), else Vitest's default.
 * Mirrors Vitest 4/5's resolveMaxWorkers and getWorkersCountByPercentage.
 */
export function vitestMaxWorkers(
  userValue: unknown,
  watch: boolean,
  cpus: number = os.availableParallelism?.() ?? os.cpus().length,
): number {
  if (typeof userValue === "number" && userValue > 0) return userValue;
  if (typeof userValue === "string") {
    const percent = /^(\d+)%$/.exec(userValue.trim());
    if (percent) {
      return Math.max(1, Math.min(cpus, Math.round((Number(percent[1]) / 100) * cpus)));
    }
    const count = Number.parseInt(userValue, 10);
    if (count > 0) return count;
  }
  return watch ? Math.max(Math.floor(cpus / 2), 1) : Math.max(cpus - 1, 1);
}

/** Why hot cannot run here because its worker would load a different Vitest, or null. */
function workerVitestMismatchReason(workerEntry: string, projectRoot: string): string | null {
  const mismatch = workerVitestMismatch(workerEntry, projectRoot);
  return mismatch
    ? `its worker would load vitest@${mismatch.worker.version} while this run uses ` +
        `vitest@${mismatch.project.version}`
    : null;
}

type CliOptions = { isolate?: unknown; pool?: unknown; maxWorkers?: unknown };

export function reactNative(options?: VitestNativeOptions): Plugin {
  // Per plugin INSTANCE, not module scope. A Vitest workspace calls reactNative() once
  // per project and they share this module, so module-level state means the last
  // project's configResolved decides for all of them — suppressing the warning for a
  // project that needs it, or raising it for one that does not.
  let jestMockTransformPresent = true;
  // The hot runtime chosen in config(), re-checked against Vitest's resolved config.
  // Keyed by project root: each project decides for itself, and an instance can see
  // more than one project (a config re-used by several, or Vitest 4 workspaces).
  const hotSelections = new Map<
    string,
    { pool: unknown; userPool: unknown; userMaxWorkers: unknown; singleWorkerAccepted: boolean }
  >();
  // Project roots this instance configured for the native engine, and the setup file
  // it gave each project root.
  const nativeRoots = new Set<string>();
  const contributedSetup = new Map<string, string>();
  let warnedMissingJestMockTransform = false;
  let warnedTsconfigPaths = false;

  const warnIfJestMockUnhoisted = (code: string, id: string): void => {
    if (jestMockTransformPresent || warnedMissingJestMockTransform) return;
    // The advice is for the project's own test and setup files. An inlined dependency
    // is not the user's to change, and vitest-native's own files (the jest-compat setup
    // implements jest.mock; the plugin source names it) only mention the call.
    if (/[\\/]node_modules[\\/]/.test(id) || containsPath(ownPackageDir, id)) return;
    if (!HAS_JEST_MOCK_CALL.test(code)) return;
    warnedMissingJestMockTransform = true;
    console.warn(
      `[vitest-native] ${id} calls jest.mock(), but jestMockTransform() is not in your ` +
        `plugins. Vitest only hoists mocks written on the vi/vitest identifier, so this ` +
        `call runs after the imports it should intercept and the mock will not apply.\n` +
        `Add it AFTER reactNative():\n\n` +
        `  import { jestMockTransform } from 'vitest-native/jest-compat'\n` +
        `  plugins: [reactNative(), jestMockTransform()]`,
    );
  };

  // --- Validate options eagerly so users get fast, clear errors ---

  if (options) {
    validateOptions(options as unknown as Record<string, unknown>);
    warnUnknownOptions(options as unknown as Record<string, unknown>);
  }

  if (options?.mocks && containsFunctions(options.mocks)) {
    throw new VitestNativeError(
      "INVALID_OPTION",
      `The "mocks" option contains function values, which cannot be ` +
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
  // The subset of those whose getter prints a deprecation notice when read.
  let rnFacadeDeprecated = new Set<string>();
  let rnFacadeRoot = "";
  // One project-scoped owner/transform/reset policy. Config, the Vite fallback
  // transform, runtime serialization and diagnostics all consume this same object.
  let nativeOwnership: NativeOwnershipPolicy | null = null;
  const assertInlineOwnership = (inline: unknown) => {
    if (engine !== "native" || !nativeOwnership) return;
    const conflicts = findNativeInlineConflicts(nativeOwnership, inline);
    if (conflicts.length === 0) return;
    const selection = conflicts.includes("*")
      ? "server.deps.inline:true"
      : `server.deps.inline overlaps Node-owned package${conflicts.length === 1 ? "" : "s"}: ${conflicts.join(", ")}`;
    throw new VitestNativeError(
      "INLINE_BREAKS_OWNERSHIP",
      `engine:'native' cannot run because ${selection}. Vitest gives inlining ` +
        `precedence over the engine's Node-ownership rules, so the same React Native ` +
        `package can load once through Vite and again through Node with separate module ` +
        `state. Remove the overlapping inline rule; use reactNative({ transform: [...] }) ` +
        `for Metro-source packages that need compiling.`,
    );
  };
  // Project root for resolver alignment; set for every run, not only when
  // ecosystem packages happen to be detected.
  let alignRoot = "";

  // Vite and Node must land on the same file for a package, or it exists twice with
  // separate module-level state. Cached: resolveId runs for every import.
  const alignedCache = new Map<string, string | null>();
  // Extensionless relative imports, shared by both engines (see the comment inside).
  const resolveExtensionless = (source: string, importer?: string): string | undefined => {
    // Extensionless relative imports, resolved as Metro does: platform extensions in
    // priority order, and file names matched exactly. Many RN-ecosystem packages use
    // them internally (e.g. './utils' meaning './utils.js'), where Vite does not apply
    // resolve.extensions at all. In the project's own files Vite does, but by asking the
    // filesystem, and macOS and Windows answer case-insensitively: the React Native
    // template's `import App from '../App'` resolved to its `app.json`, because Metro's
    // extension order tries `.json` before `.tsx` (see existsExact).
    if (importer && path.isAbsolute(importer) && source.startsWith(".") && !path.extname(source)) {
      const cacheKey = `${importer}\0${source}`;
      const cached = resolveCache.get(cacheKey);
      if (cached !== undefined) return cached;

      const importerDir = path.dirname(importer);
      const absolute = path.resolve(importerDir, source);

      // Try as a file with extensions
      for (const ext of extensions) {
        const candidate = absolute + ext;
        if (existsExact(candidate)) {
          resolveCache.set(cacheKey, candidate);
          return candidate;
        }
      }

      // Try as a directory with index file
      for (const ext of extensions) {
        const candidate = path.join(absolute, `index${ext}`);
        if (existsExact(candidate)) {
          resolveCache.set(cacheKey, candidate);
          return candidate;
        }
      }

      // Cache misses too to avoid re-scanning the filesystem.
      resolveCache.set(cacheKey, undefined);
    }
    return undefined;
  };

  const alignedResolution = (source: string, importer?: string): string | undefined => {
    if (engine !== "native") return undefined;
    // Resolve from the importer when there is one. Under pnpm and nested
    // node_modules the correct copy of a package depends on who is asking, and
    // anchoring everything at the project root would hand Vite a different copy
    // than Node gives the same importer — replacing a duplicate-instance bug with
    // a wrong-version one.
    const from =
      importer && path.isAbsolute(importer) && !importer.startsWith("\0")
        ? importer
        : path.join(alignRoot || process.cwd(), "package.json");
    const key = `${from}\u0000${source}`;
    const cached = alignedCache.get(key);
    if (cached !== undefined) return cached ?? undefined;
    let result: string | null = null;
    try {
      const req = createRequire(from);
      result = alignLegacyFieldsWithNode(
        source,
        (name) => {
          try {
            return path.dirname(req.resolve(`${name}/package.json`));
          } catch {
            return null;
          }
        },
        (dir) => {
          try {
            return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
          } catch {
            return null;
          }
        },
        (name) => {
          try {
            return req.resolve(name);
          } catch {
            return null;
          }
        },
        // Only React Native itself, which is served to Vite through a facade and
        // must not be redirected. Ecosystem and `transform` packages used to be
        // executed by Vite, which is why they were excluded here; they are loaded by
        // Node now, so aligning them is exactly what keeps one copy. Leaving them out
        // let a dual-format workspace library split again — Vite taking its `module`
        // build while Node took `main` — which is the reported failure reproduced in
        // consumer-tests/monorepo.
        (name) => name === "react-native" || name.startsWith("@react-native"),
      );
    } catch {
      result = null;
    }
    alignedCache.set(key, result);
    return result ?? undefined;
  };

  // Caches for hot paths — resolveId and load are called for every import.
  const resolveCache = new Map<string, string | undefined>();
  const virtualCodeCache = new Map<string, string>();

  // Resolve the setup file eagerly (it's relative to the plugin, not the consumer).
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  // This package's root: `dist/` when installed, `src/` in this repository.
  const ownPackageDir = path.resolve(thisDir, "..");
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
  const EXPORT_RECOVERY_ARGV = [
    "--import",
    pathToFileURL(path.resolve(thisDir, "native/export-condition-recovery-preload.mjs")).href,
  ];
  // Hot-runtime worker entry + runner (shipped verbatim alongside the setup file).
  const nativeWorkerPath = path.resolve(thisDir, "native/worker.mjs");
  const nativeRunnerPath = path.resolve(thisDir, "native/runner.mjs");

  // Seeded with bare React Native defaults, then replaced project-by-project by
  // the bounded Metro profile loader during config().
  const platform = options?.platform ?? "ios";
  const diagnostics = options?.diagnostics ?? false;
  // Capture the user-requested engine; concrete resolution happens in config().
  const requestedEngine = options?.engine ?? "auto";
  // Extra node_modules packages the native engine should transform (Flow/TS/JSX),
  // and the ones it must never transform whatever else selects them. Two shapes: an
  // array is the include list, an object names both.
  const { include: transformPkgs, exclude: neverTransform } = normalizeTransformOption(
    options?.transform,
  );
  // Hot runtime (native engine only): persistent RN-hot workers with per-file
  // isolation via the custom pool. `auto` is a conservative selector: it keeps
  // stock isolation whenever config-time evidence cannot prove this path safe.
  // 'auto' by default: the bounded hot runtime where config-time evidence shows it
  // is safe, per-file isolation otherwise. Declines are reported only when the user
  // asked for hot explicitly; the implicit default falls back quietly.
  const hotRuntimeExplicit = options?.hotRuntime !== undefined;
  const hotRuntimeOpt = options?.hotRuntime ?? "auto";
  const hotRuntimeRequested = hotRuntimeOpt !== false;
  const hotRuntimeAuto = hotRuntimeOpt === "auto";
  const hotRecycle = typeof hotRuntimeOpt === "object" ? hotRuntimeOpt : {};
  // Resolved at config() time, once the consumer project root is known. Seeded to a
  // safe default so the hooks (resolveId/load/transform), which run after config(),
  // never read undefined.
  let engine: "mock" | "native" = requestedEngine === "native" ? "native" : "mock";
  let sourceExts = ["js", "jsx", "json", "ts", "tsx"];
  let extensions = getPlatformExtensions(platform);
  let assetExtList = assetExtensionsFor(sourceExts, DEFAULT_ASSET_EXTS, options?.assetExts ?? []);

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

  const pluginDefinition = {
    name: "vitest-native",
    enforce: "pre",

    // This plugin is `enforce:"pre"` for resolution/transform semantics, but its
    // config decision is wrapped as an order:"post" hook below. Automatic hot
    // selection must see pools and setup files contributed by later plugins.
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
      alignRoot = resolvedRoot;
      const metroOption = options?.metroConfig;
      if (metroOption === true || typeof metroOption === "object") {
        const metroSettings = typeof metroOption === "object" ? metroOption : {};
        let metro;
        try {
          metro = await loadProjectMetroProfile({
            projectRoot: resolvedRoot,
            platform,
            configFile: metroSettings.configFile,
          });
        } catch (error) {
          // A profile the child returned but that failed validation keeps its own code
          // (METRO_PROFILE_INVALID); the config hint only applies to a config that
          // could not be loaded, and it is appended rather than wrapping the message.
          const code = (error as { code?: unknown })?.code;
          if (code !== undefined && code !== "METRO_CONFIG_LOAD_FAILED") throw error;
          throw new VitestNativeError(
            "METRO_CONFIG_LOAD_FAILED",
            `${String((error as Error)?.message ?? error).replace(/^\[vitest-native\] /, "")}\n` +
              `Fix the Metro config, pass metroConfig:{ configFile:'...' } when it lives ` +
              `outside the project root, or use metroConfig:false to explicitly keep ` +
              `vitest-native's built-in React Native defaults.`,
            { cause: error },
          );
        }
        // A custom resolveRequest is code, not data, so it cannot run here. It does not
        // run without metroConfig either, so refusing the declarative profile would keep
        // the same gap while also dropping the extensions that can be honoured, and it
        // would block the common case: tools such as Uniwind and
        // react-native-monorepo-config install one that delegates with narrow redirects.
        // The profile applies, and the gap is named once with the way to close it.
        if (metro.profile.customResolver) {
          console.warn(
            `[vitest-native] The Metro config installs resolver.resolveRequest, which is ` +
              `code and does not run under Vitest. Its source and asset extensions apply; ` +
              `a module it redirects resolves as Vite and Node resolve it. Where a redirect ` +
              `matters to tests, reproduce it with resolve.alias.`,
          );
        }
        sourceExts = [...metro.profile.sourceExts];
        extensions = getConfiguredPlatformExtensions(platform, sourceExts);
        assetExtList = assetExtensionsFor(
          sourceExts,
          metro.profile.assetExts,
          options?.assetExts ?? [],
        );
        if (diagnostics) {
          const childRss = metro.evidence.rss
            ? `, child RSS ${Math.ceil(metro.evidence.rss / 1024 / 1024)} MiB`
            : "";
          console.log(
            `[vitest-native] Metro profile: ${metro.profile.provenance}` +
              `${metro.profile.configPath ? ` (${metro.profile.configPath})` : ""}; ` +
              `sourceExts=${sourceExts.join(",")}; assetExts=${assetExtList.join(",")}; ` +
              `loaded in ${metro.evidence.durationMs ?? "?"}ms${childRss}.`,
          );
          console.log(
            `[vitest-native] Metro resolverMainFields=${metro.profile.resolverMainFields.join(",")} ` +
              `and conditions=${metro.profile.conditionNames.join(",")} are observational; ` +
              `module ownership keeps the package-format policy authoritative.`,
          );
        }
      }
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
        throw new VitestNativeError(
          "ENGINE_REQUIRES_BABEL",
          `engine:'native' requires react-native, '@react-native/babel-preset', and ` +
            `'@babel/core' to resolve from ${resolvedRoot} — missing: ` +
            `${decision.missing.join(", ")}. React Native projects ship all three ` +
            `by default. Install what's missing (react-native as a dependency, the ` +
            `toolchain as devDependencies), or set engine:'mock' to run without a ` +
            `React Native install.`,
        );
      }
      // The fallback notice is a warning — a team that believes it is testing real
      // React Native while running the mock is the exact failure mode the engine
      // split exists to prevent.
      if (decision.notice) console.warn(decision.notice);
      // The native engine's banner waits for the runtime decision below.
      if (engine !== "native") printEngineBanner(engine, platform, resolvedRoot);
      const env: Record<string, string> = {
        VITEST_NATIVE_PLATFORM: platform,
        VITEST_NATIVE_DIAGNOSTICS: String(diagnostics),
        VITEST_NATIVE_PROJECT_ROOT: resolvedRoot,
      };
      // jest.requireActual resolves through Node, which does not apply resolve.alias.
      // Hand the serializable entries to the compat setup so an aliased specifier
      // (`@/services/api`) reaches the same file the suite's imports do.
      const requireAliases = serializableAliases(
        (userConfig as { resolve?: { alias?: unknown } }).resolve?.alias,
        resolvedRoot,
      );
      // tsconfig `paths` too, whenever Vite resolves them for imports: the user turned
      // `resolve.tsconfigPaths` on, or the plugin does for an Expo project (below).
      const userTsconfigPaths = (userConfig.resolve as { tsconfigPaths?: unknown } | undefined)
        ?.tsconfigPaths;
      const viteMajorForPaths = Number(resolvePackageVersion("vite", resolvedRoot)?.split(".")[0]);
      if (
        userTsconfigPaths === true ||
        expoTsconfigPaths(resolvedRoot, userTsconfigPaths, viteMajorForPaths) === "enable"
      ) {
        requireAliases.entries.push(...tsconfigPathAliases(resolvedRoot).entries);
      }
      if (requireAliases.entries.length > 0) {
        env.VITEST_NATIVE_REQUIRE_ALIASES = JSON.stringify(requireAliases.entries);
      }
      if (requireAliases.skipped.length > 0) {
        env.VITEST_NATIVE_REQUIRE_ALIASES_SKIPPED = JSON.stringify(requireAliases.skipped);
      }
      const reactNativeVersion = resolvePackageVersion("react-native", resolvedRoot);
      if (reactNativeVersion) env.VITEST_NATIVE_RN_VERSION = reactNativeVersion;
      // Asset extensions for the Node require-hook to stub (matches the Vite-graph
      // asset stubbing): a CJS `require('./logo.png')` reaching Node's loader must
      // resolve to the basename string, not be compiled as JS.
      env.VITEST_NATIVE_ASSET_EXTS = JSON.stringify(assetExtList);
      if (metroOption === true || typeof metroOption === "object") {
        env.VITEST_NATIVE_SOURCE_EXTS = JSON.stringify(sourceExts);
      }
      if (hotRuntimeRequested && hotRecycle.preserveGlobals?.length) {
        env.VITEST_NATIVE_HOT_PRESERVE_GLOBALS = JSON.stringify(hotRecycle.preserveGlobals);
      }
      // Only the opt-out is passed: the setup file defaults this on under hot, so
      // an absent variable means "on" and nothing has to be forwarded to say so.
      if (hotRuntimeRequested && hotRecycle.esmGeneration === false) {
        env.VITEST_NATIVE_HOT_ESM_GEN = "0";
      }

      // Native engine: externalize RN so it loads through Node's single CJS graph,
      // where the native setup file's hooks Flow-strip it and mock the boundary.
      if (engine === "native") {
        if (options?.mocks && Object.keys(options.mocks).length > 0) {
          throw new VitestNativeError(
            "MOCKS_REQUIRE_MOCK_ENGINE",
            `The "mocks" option is only supported by engine:'mock'. ` +
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
        const disabledNative = disabledPresetNames(options?.presets);
        const nativePresetNames = Array.isArray(options?.presets)
          ? options.presets.map((p) => p.name)
          : autoDetectPresetNames(resolvedRoot, diagnostics).filter((n) => !disabledNative.has(n));
        if (nativePresetNames.length > 0) {
          env.VITEST_NATIVE_PRESET_NAMES = JSON.stringify(nativePresetNames);
        }
        // Per-preset config (e.g. navigation({ defaultRouteParams })) must travel to
        // the worker, where presets are rebuilt from their name. Only explicitly
        // configured presets carry config; auto-detected ones use their defaults.
        if (Array.isArray(options?.presets)) {
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
        // will compile them. Detect them, assign them to Node's native transform, and
        // externalize them rather than making every project rediscover the list one
        // SyntaxError at a time.
        // Where the run's tests live, as far as `test.include` reveals it. When the
        // run root sits ABOVE the package under test — an Nx-style invocation from
        // the repository root — the root alone cannot say which package is the
        // project, so a library holding the tests looked like an ordinary dependency
        // and its whole directory was externalized. An include pattern pointing into
        // that package says so directly. A pattern with nothing literal before its
        // first wildcard (the default, `**/*.test.ts`) says nothing and is ignored.
        const includeRoots = testIncludeRoots(
          (userConfig as { test?: { include?: unknown } }).test?.include,
          resolvedRoot,
        );
        // `inline: true` is a user override of the normal ownership boundary. It is
        // recorded in the manifest so diagnostics never claim graph uniqueness when
        // Vitest will give inlining precedence over the engine's external patterns.
        const userInline = (userConfig as { test?: { server?: { deps?: { inline?: unknown } } } })
          .test?.server?.deps?.inline;
        const userInlinesEverything = userInline === true;
        const ecosystem = detectEcosystemPackages(
          [resolvedRoot, ...includeRoots],
          transformPkgs,
          includeRoots,
          neverTransform,
          nativePresetNames,
        );
        // The directories Vite owns outright. Handed to the worker so the require
        // hook can say so if Node loads one of their files anyway — which happens
        // when an installed React Native package depends on the very package whose
        // tests are running, and whose only symptom otherwise is state that reads
        // back unset. See checkProjectSourceResolvedByNode in native/hooks.mjs.
        //
        // A directory containing a LINKED detected package is dropped. Running from a
        // repository root, the nearest manifest is the root's own, and every workspace
        // library sits beneath it — including the ones Node owns correctly, whose
        // every load would then be reported as a mistake. Rather than warn wrongly in
        // a layout the engine handles properly, it says nothing there. Installed
        // packages under the directory's own node_modules do not count: they are
        // excluded by the hook itself, and treating them as disqualifying would
        // silence the warning in the case it exists for.
        const linkedDetectedDirs = ecosystem
          .map((name) => packageDirOf(name, resolvedRoot))
          .filter((dir): dir is string => dir !== null && !/[\\/]node_modules[\\/]/.test(dir));
        const projectDirs = [
          ...new Set(
            [resolvedRoot, ...includeRoots]
              .map((dir) => nearestPackageDir(dir))
              .filter((dir): dir is string => dir !== null),
          ),
        ].filter((dir) => !linkedDetectedDirs.some((detected) => containsPath(dir, detected)));
        if (projectDirs.length > 0) {
          env.VITEST_NATIVE_PROJECT_DIRS = JSON.stringify(projectDirs);
        }
        nativeOwnership = createNativeOwnershipPolicy({
          projectRoot: resolvedRoot,
          explicitTransforms: transformPkgs,
          ecosystemPackages: ecosystem,
          runtimeTransformAugmentations:
            nativePresetNames.length > 0 ? ["preset-pass-through-modules"] : [],
          projectDirs,
          serverDepsInlineAll: userInlinesEverything,
        });
        assertInlineOwnership(userInline);

        const userTest = (
          userConfig as {
            test?: {
              fileParallelism?: boolean;
              maxWorkers?: number | string;
              pool?: unknown;
              isolate?: unknown;
            };
          }
        ).test;
        const userPool = userTest?.pool;
        // VM pools are incompatible with the native engine itself, irrespective of
        // whether automatic hot selection would otherwise decline.
        if (isVmPool(userPool)) throw vmPoolUnsupported(userPool);
        nativeRoots.add(vitestRootOf(userConfig));

        // Admit the hot runtime BEFORE compiling React Native's registry. On a
        // constrained container the registry build itself is a material memory
        // event, so discovering here that only an unrecyclable one-worker run fits
        // gives the user a deterministic configuration error instead of risking an
        // OOM during an optimization that the run cannot safely use anyway.
        let hotMemory:
          | {
              plan: HotMemoryPlan;
              memoryLimit: number;
              allowUnboundedMemory: boolean;
            }
          | undefined;
        if (hotRuntimeRequested) {
          const { createHotMemoryPlan, formatHotMemoryPlan, resolveRequestedWorkers } =
            await import("./native/memory.mjs");
          const requestedWorkers = resolveRequestedWorkers(userTest?.maxWorkers, {
            fileParallelism: userTest?.fileParallelism,
          });
          const plan = createHotMemoryPlan({ requestedWorkers });
          const allowUnboundedMemory = hotRecycle.allowUnboundedMemory === true;
          const configConflict = hotAutoConfigDeclineReason(userPool, userTest?.isolate);
          if (!hotRuntimeAuto && configConflict !== null)
            throw hotRuntimeOverridden(configConflict);
          const autoDeclineReason = hotRuntimeAuto
            ? (configConflict ??
              workerVitestMismatchReason(nativeWorkerPath, resolvedRoot) ??
              (plan.maxWorkers < 2
                ? `the ${plan.source} memory/scheduler plan selects only one unrecyclable worker`
                : null))
            : null;
          if (autoDeclineReason !== null) {
            if (hotRuntimeExplicit || diagnostics) {
              console.warn(
                `[vitest-native] hotRuntime:'auto' kept default isolation: ${autoDeclineReason}.`,
              );
            }
          } else if (!allowUnboundedMemory && plan.maxWorkers < 2) {
            throw new VitestNativeError(
              "HOT_MEMORY_UNBOUNDED",
              `hotRuntime cannot enforce its memory budget with one worker because Vitest ` +
                `batches every file into one unrecyclable task. The effective ` +
                `${plan.source} memory ceiling admits ${plan.admittedWorkers} worker, ` +
                `or this config explicitly selects one. Use hotRuntime:false, provide enough ` +
                `memory for at least two workers, or explicitly accept unbounded growth with ` +
                `hotRuntime:{ allowUnboundedMemory:true }.`,
            );
          }
          if (
            autoDeclineReason === null &&
            (hotRuntimeExplicit || diagnostics) &&
            !allowUnboundedMemory &&
            userTest?.maxWorkers != null &&
            plan.maxWorkers < requestedWorkers
          ) {
            console.warn(
              `[vitest-native] hotRuntime capped maxWorkers from ${requestedWorkers} to ` +
                `${plan.maxWorkers} for the ${plan.source} memory budget. ` +
                `Set diagnostics:true to see the full envelope.`,
            );
          }
          if (autoDeclineReason === null && diagnostics) {
            for (const line of formatHotMemoryPlan(plan)) {
              console.log(`[vitest-native] memory: ${line}`);
            }
            if (allowUnboundedMemory) {
              console.warn(
                `[vitest-native] memory: allowUnboundedMemory:true disables the automatic ` +
                  `worker cap and process-RSS enforcement.`,
              );
            }
          }
          if (autoDeclineReason === null) {
            env.VITEST_NATIVE_MEMORY_PLAN = JSON.stringify({
              ...plan,
              enforced: !allowUnboundedMemory,
            });
            hotMemory = {
              plan,
              memoryLimit: hotRecycle.memoryLimit ?? plan.workerHeapLimit,
              allowUnboundedMemory,
            };
          }
        }

        const registryFile = await buildRegistryFor({
          projectRoot: resolvedRoot,
          platform,
          reactNativeVersion: reactNativeVersion ?? "0.0.0",
          assetExts: assetExtList,
          sourceExts,
          diagnostics,
        });
        if (registryFile) env.VITEST_NATIVE_RN_REGISTRY = registryFile;

        // Lazy import: pulls in vitest/node, which only exists when running under
        // Vitest (not plain Vite). Memory admission above deliberately has no
        // Vitest dependency, so it can run before the registry optimization.
        let hot:
          | { pool: PoolRunnerInitializer; runnerPath: string; maxWorkers?: number }
          | undefined;
        if (hotMemory) {
          const { nativePool } = await import("./native/pool.js");
          hot = {
            pool: nativePool({
              workerEntry: nativeWorkerPath,
              projectRoot: resolvedRoot,
              recycleAfterFiles: hotRecycle.recycleAfterFiles,
              memoryLimit: hotMemory.memoryLimit,
              memoryPlan: hotMemory.plan,
              allowUnboundedMemory: hotMemory.allowUnboundedMemory,
              diagnostics,
            }),
            runnerPath: nativeRunnerPath,
            maxWorkers: hotMemory.allowUnboundedMemory ? undefined : hotMemory.plan.maxWorkers,
          };
        }
        printEngineBanner(engine, platform, resolvedRoot, hot !== undefined);
        if (hot) {
          hotSelections.set(vitestRootOf(userConfig), {
            pool: hot.pool,
            userPool,
            userMaxWorkers: userTest?.maxWorkers,
            singleWorkerAccepted: hotMemory?.allowUnboundedMemory === true,
          });
        } else {
          hotSelections.delete(vitestRootOf(userConfig));
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
            userInlinesEverything,
            projectDirs,
            nativeOwnership,
          ),
        );
      }

      // --- mock engine (existing behaviour) ---
      if (hotRuntimeRequested && hotRuntimeExplicit) {
        console.warn(
          `[vitest-native] 'hotRuntime' only applies to engine:'native' (resolved engine: '${engine}'); ignoring.`,
        );
      }
      // Custom mock overrides (validated above to be serializable).
      if (options?.mocks && Object.keys(options.mocks).length > 0) {
        env.VITEST_NATIVE_MOCKS = JSON.stringify(options.mocks);
      }

      // An explicit ARRAY is the full list, so setup.ts must not auto-detect. The
      // object form keeps detection — the worker does that itself — and only needs to
      // know which names to drop. `resolved` is not assigned until configResolved,
      // so neither branch can read it here.
      if (Array.isArray(options?.presets)) {
        env.VITEST_NATIVE_PRESET_NAMES = JSON.stringify(options.presets.map((p) => p.name));
      } else {
        const disabled = disabledPresetNames(options?.presets);
        if (disabled.size > 0) {
          env.VITEST_NATIVE_PRESET_DISABLED = JSON.stringify([...disabled]);
        }
      }

      return asCompatibleViteConfig({
        // Match RN's Babel preset: automatic JSX runtime, so app/test files using
        // JSX without importing React compile to `react/jsx-runtime` rather than
        // `React.createElement` ("React is not defined").
        ...jsxTransform,
        // See native/apply.ts: `conditions` and `mainFields` cover the client
        // environment only, and Vitest runs tests in the ssr one — a package shipping
        // a React Native build behind either mechanism would otherwise resolve to its
        // web build.
        // Metro resolves `react-native` ahead of the standard fields, and plenty of
        // packages published before `exports` still ship their native build that way.
        // Vite drops `mainFields` for the ssr environment exactly as it drops
        // `conditions` (see getDefaultEnvironmentOptions), so this has to be set where
        // the tests resolve. Vite's own server defaults are kept underneath;
        // `browser` is deliberately NOT added — Metro lists it, but under Node it would
        // pull the web build of any package that has a browser field and no
        // react-native one.
        ssr: {
          resolve: {
            conditions: ["react-native"],
            mainFields: ["react-native", "module", "jsnext:main", "jsnext"],
          },
        },
        resolve: {
          extensions,
          conditions: ["react-native"],
          mainFields: ["react-native", "module", "jsnext:main", "jsnext"],
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
      // Recorded here rather than guessed later: the resolved plugin list is the only
      // place that knows whether the hoisting transform is actually installed.
      jestMockTransformPresent = (config.plugins ?? []).some(
        (plugin) => (plugin as { name?: string })?.name === "vitest-native:jest-mock-hoist",
      );

      // Vitest folds Vite `ssr.noExternal` / environment noExternal settings into
      // server.deps.inline during its pre-ordered configResolved hook. Re-check the
      // FINAL shape here so an indirect inline-all or a later-merged package pattern
      // cannot bypass the config() guard above.
      const finalInline = (
        config as unknown as { test?: { server?: { deps?: { inline?: unknown } } } }
      ).test?.server?.deps?.inline;
      assertInlineOwnership(finalInline);

      const duplicateReact = findDuplicateReact(
        (specifier, from) => {
          try {
            return createRequire(path.join(from, "package.json")).resolve(specifier);
          } catch {
            return null;
          }
        },
        config.root,
        ["@testing-library/react-native", "react-test-renderer", "react-native"],
      );
      if (duplicateReact) {
        console.warn(
          `[vitest-native] Two copies of React are resolvable: your project loads one, ` +
            `and '${duplicateReact.consumer}' loads another.\n` +
            `  project: ${duplicateReact.projectCopy}\n` +
            `  ${duplicateReact.consumer}: ${duplicateReact.otherCopy}\n` +
            `React throws "Cannot read properties of null (reading 'use')" when hooks run ` +
            `through a second copy, which React Native Testing Library reports as a failure ` +
            `to detect host component names. Install a single React version at the project ` +
            `root (npm dedupe, or match the version '${duplicateReact.consumer}' expects).`,
        );
      }

      // Validate peer dependencies (table shared with the CLI's doctor command).
      const peerErrors: string[] = [];
      for (const { name, minimum, maximumMajor, minimumByMajor, optional } of PEER_REQUIREMENTS) {
        if (optional) continue; // reported below, never fatal
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
        throw new VitestNativeError(
          "UNSUPPORTED_PEER",
          `Unsupported peer dependencies:\n- ${peerErrors.join("\n- ")}`,
        );
      }

      // Optional peers (RNTL): report but never block — absent is a valid setup.
      for (const { name, minimum, maximumMajor, minimumByMajor, optional } of PEER_REQUIREMENTS) {
        if (!optional) continue;
        const error = validatePeerDependency(
          name,
          minimum,
          config.root,
          maximumMajor,
          minimumByMajor,
        );
        if (error && !error.includes("not found")) {
          console.warn(`[vitest-native] ${error}`);
        }
      }

      // Now we have the real project root — resolve options from consumer context.
      resolved = await resolveOptions(options, config.root, {
        extensions,
        assetExts: assetExtList,
      });
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
          const indexSource = fs.readFileSync(indexPath, "utf8");
          const names = parseReactNativeExports(indexSource);
          rnFacadeExports = names.length > 0 ? names : null;
          rnFacadeDeprecated = new Set(parseDeprecatedReactNativeExports(indexSource));
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
        const presetHit = resolvePresetId(source);
        if (presetHit) return presetHit;
        return resolveExtensionless(source, importer) ?? alignedResolution(source, importer);
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
      const extensionless = resolveExtensionless(source, importer);
      if (extensionless !== undefined) return extensionless;

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
          ...rnFacadeExports
            .filter((n) => !rnFacadeDeprecated.has(n))
            .map((n) => `export const ${n} = _rn[${JSON.stringify(n)}];`),
          `export default _rn;`,
          // An ESM binding is read once, when the module initialises, and reading a
          // deprecated member is what prints its notice. These stay getters on the
          // module's exports object, so the notice appears only where one is used.
          ...(rnFacadeDeprecated.size > 0
            ? [
                `for (const name of ${JSON.stringify([...rnFacadeDeprecated])}) {`,
                `  Object.defineProperty(__vite_ssr_exports__, name, {`,
                `    enumerable: true,`,
                `    configurable: true,`,
                `    get: () => _rn[name],`,
                `  });`,
                `}`,
              ]
            : []),
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
      warnIfJestMockUnhoisted(code, id);
      // This hook is an ACTUAL observation that Vite claimed the file. A Node-owned
      // package reaching it is therefore not a hypothetical resolver disagreement:
      // evaluating it would create a second live identity. Fail before evaluation,
      // using the same project policy that generated externalization and the worker
      // matchers. This catches indirect noExternal settings and later plugin merges
      // that config-time pattern checks cannot predict.
      if (engine === "native") {
        if (!nativeOwnership) return undefined;
        const conflict = findNativeOwnershipConflict(nativeOwnership, id, "vite");
        if (!conflict) return undefined;
        throw new VitestNativeError(
          "MODULE_OWNER_CONFLICT",
          `Vite attempted to transform '${id}', but the native ownership policy assigns ` +
            `that file to Node (${conflict.decision.reason}). Evaluating it in Vite would ` +
            `create a second module instance with separate state. Remove the inline/noExternal ` +
            `rule that claimed it; Metro-source packages belong in reactNative({ transform: [...] }).`,
        );
      }

      // Flow-strip inlined react-native-* ecosystem packages that ship `@flow` —
      // packages pulled into the Vite graph. (NOT react-native itself: under the mock
      // engine its imports resolve to virtual modules via resolveId above and never
      // reach here.) This is the mock engine's only Flow-stripping for such inlined
      // packages, since Vite's own pipeline can't parse Flow.
      //
      // Matched on the package NAME after node_modules rather than the substring
      // anywhere in the path: `id.includes("react-native")` also fired for every
      // dependency of a project in a directory called `react-native-app`, and for
      // unrelated packages such as eslint-plugin-react-native — running a Flow parser
      // over files with nothing to do with React Native.
      if (!RN_ECOSYSTEM_PATH.test(id) || !id.endsWith(".js")) return undefined;
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
  } satisfies Plugin;

  const configHandler = pluginDefinition.config;
  // Vite's Plugin type does not declare Vitest's configureVitest hook.
  return {
    ...pluginDefinition,
    // Choosing from the original user object can create an unsafe hybrid such as
    // isolate:false + the hot runner + a later-overridden forks pool. Vite's
    // per-hook order lets only config run last while resolve/transform remain pre.
    config: {
      order: "post",
      async handler(this: unknown, userConfig: UserConfig, env: unknown) {
        const result = await (configHandler as (...args: unknown[]) => unknown).call(
          this,
          userConfig,
          env,
        );
        // Vitest reads `projects` after every config hook, so pinning in place reaches it.
        pinInlineProjectRoots((userConfig as { test?: unknown }).test, vitestRootOf(userConfig));
        const test = (
          result as { test?: { setupFiles?: unknown; execArgv?: string[] } } | undefined
        )?.test;
        if (Array.isArray(test?.setupFiles) && typeof test.setupFiles[0] === "string") {
          contributedSetup.set(vitestRootOf(userConfig), test.setupFiles[0]);
          prependSetupFile(userConfig, test);
        }
        // Both engines add `react-native` to the conditions Vitest forwards to every
        // worker, where it also governs how Vitest loads the test environment. Preload
        // the recovery for packages that name a `react-native` target they do not ship
        // (see native/export-condition-recovery.mjs). Vite concatenates this with the
        // user's own `test.execArgv`.
        if (test) test.execArgv = [...(test.execArgv ?? []), ...EXPORT_RECOVERY_ARGV];
        if (test) {
          const viteRoot = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
          const viteMajor = Number(resolvePackageVersion("vite", viteRoot)?.split(".")[0]);
          const tsconfigPaths = expoTsconfigPaths(
            viteRoot,
            (userConfig.resolve as { tsconfigPaths?: unknown } | undefined)?.tsconfigPaths,
            viteMajor,
          );
          const config = result as { resolve?: Record<string, unknown> };
          if (tsconfigPaths === "enable")
            config.resolve = { ...config.resolve, tsconfigPaths: true };
          else if (tsconfigPaths === "unsupported" && !warnedTsconfigPaths) {
            warnedTsconfigPaths = true;
            console.warn(
              `[vitest-native] This Expo project's tsconfig declares \`paths\`, which Expo's ` +
                `Metro resolves by default, but Vite ${viteMajor} cannot (Vite 8 adds ` +
                `\`resolve.tsconfigPaths\`). Upgrade to Vite 8, or add the vite-tsconfig-paths ` +
                `plugin, so imports such as \`@/…\` resolve in tests.`,
            );
          }
        }
        return result;
      },
    },
    // Vitest calls this once projects are resolved with CLI options applied and before
    // any worker starts: the last point at which the runtime can still change.
    configureVitest({
      vitest,
      project,
    }: {
      vitest: {
        // Vitest 4 keeps the CLI flags on `_cliOptions` (internal); Vitest 5 on
        // `config.cliOptions`. The vitest-semantics gate runs both and fails by name
        // if either moves.
        _cliOptions?: CliOptions;
        config?: { cliOptions?: CliOptions; watch?: boolean; maxWorkers?: unknown };
        projects?: readonly GroupedProject[];
      };
      project: {
        config: {
          root?: string;
          pool?: unknown;
          isolate?: unknown;
          maxWorkers?: unknown;
          fileParallelism?: unknown;
          setupFiles?: unknown;
          runner?: unknown;
          env?: Record<string, string>;
        };
      };
    }) {
      const projectConfig = project.config;
      const root = projectConfig.root ? path.resolve(projectConfig.root) : process.cwd();
      // A project that shares a Vite server without this plugin's test config would
      // run without React Native's setup; say so instead of failing per file.
      const setupFile = contributedSetup.get(root);
      if (setupFile && !hasSetupFile(projectConfig.setupFiles, setupFile)) {
        throw new VitestNativeError(
          "SHARED_VITE_SERVER",
          `A Vitest project under ${root} shares a Vite server without vitest-native's test ` +
            `config, so React Native's setup would not run. Give the project a \`root\`, or ` +
            `set \`test.sharedViteServer: false\` in the top-level Vitest config.`,
        );
      }
      const cli = vitest._cliOptions ?? vitest.config?.cliOptions ?? {};
      // On Vitest 4 a `--pool` flag arrives after config(), past its check.
      if (nativeRoots.has(root) && isVmPool(cli.pool)) throw vmPoolUnsupported(cli.pool);
      const selection = hotSelections.get(root);
      if (!selection) return;
      const reason =
        hotOverrideReason(projectConfig, cli, selection.pool, selection.singleWorkerAccepted) ??
        sharedGroupConflict(project, vitest.projects ?? [], {
          maxWorkers: vitest.config?.maxWorkers,
          watch: vitest.config?.watch,
        });
      if (reason === null) return;
      if (!hotRuntimeAuto) throw hotRuntimeOverridden(reason);
      projectConfig.pool = cli.pool ?? selection.userPool ?? "threads";
      projectConfig.isolate = cli.isolate ?? true;
      projectConfig.runner = undefined;
      // The memory plan may have capped the worker count; give back Vitest's own.
      if (cli.maxWorkers === undefined && !process.env.VITEST_MAX_WORKERS) {
        projectConfig.maxWorkers =
          projectConfig.fileParallelism === false
            ? 1
            : selection.userMaxWorkers === undefined && vitest.config !== projectConfig
              ? // Unset here: Vitest falls back to the root config's value, then its default.
                undefined
              : vitestMaxWorkers(selection.userMaxWorkers, vitest.config?.watch === true);
      }
      if (projectConfig.env) delete projectConfig.env.VITEST_NATIVE_MEMORY_PLAN;
      hotSelections.delete(root);
      // The engine banner already said "hot runtime"; keep the log truthful.
      console.error(`[vitest-native] hot runtime off: ${reason}; Vitest's settings apply.`);
    },
  } as Plugin;
}
