import type { Plugin, UserConfig } from "vite";
import type { PoolRunnerInitializer } from "vitest/node";
import type { VitestNativeOptions, ResolvedOptions, Preset } from "./types.js";
import { getConfiguredPlatformExtensions, getPlatformExtensions } from "./resolve.js";
import { firstExact } from "./native/resolve.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import flowRemoveTypes from "flow-remove-types";
import { validateOptions, validatePeerDependency, warnUnknownOptions } from "./validate.js";
import { PEER_REQUIREMENTS } from "./peer-requirements.js";
import { VitestNativeError, VitestNativeTypeError } from "./errors.mjs";
import { presetFromModule } from "./preset-modules.mjs";
import { BUILT_IN_PRESET } from "./presets/built-in.js";
import { serializableAliases } from "./jest-compat/aliases.mjs";
import { tsconfigPathAliases } from "./native/tsconfig-paths.mjs";
import { fsModuleCacheKey, shouldDefaultFsModuleCache } from "./fs-module-cache.js";
import { knownNativeModulesFor, nativeModuleSpecsFor } from "./native/native-modules.mjs";
import { nativeEngineConfig, type JsxTransformConfig } from "./native/apply.js";
import { detectEngine } from "./native/detect.js";
import { detectEcosystemPackages } from "./native/ecosystem.js";
import { containsPath, packageDirOf } from "./native/match.mjs";
type AssetModules = typeof import("./native/assets.mjs");
import type { HotMemoryPlan } from "./native/memory.mjs";
import type { NativePoolOptions } from "./native/pool.js";
import { workerVitestMismatch } from "./native/worker-vitest.js";
import {
  assertHostResolvesRunningVitest,
  assertHotWorkerLoadsRunningVitest,
  ownVitestPackage,
  runningVite,
} from "./host.js";
import {
  CONTEXT_ENV,
  ensureProjectContext,
  projectContext,
  writeProjectContext,
  type ProjectContextFields,
} from "./context.mjs";
import { cacheRootFor } from "./native/transform.mjs";
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

import {
  AUTO_DETECT_PRESETS,
  DEFAULT_ASSET_EXTS,
  PRESET_MODULES,
  presetForInstalled,
  autoDetectedPresetApplies,
} from "./preset-map.js";

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
  presetNames: readonly string[],
  hotRuntime = false,
): void {
  // Once per process, so a multi-project run prints the first project's line only: its
  // engine, runtime and presets, which another project may not share. Naming each
  // project's would need the project's name, which config() does not reliably have.
  const g = globalThis as { __vitest_native_banner_printed?: boolean };
  if (g.__vitest_native_banner_printed) return;
  g.__vitest_native_banner_printed = true;
  // The presets are named because they are applied automatically, and each replaces a
  // whole library: an app that drives a real navigator gets the navigation preset's
  // pass-through NavigationContainer, and nothing else in the log points at it. Under
  // the native engine `presetNames` is the list its workers are handed; under the mock
  // engine, the same selection recomputed (see mockEnginePresetNames). The project's
  // own preset modules are named as the config names them.
  const mocked = presetNames.length > 0 ? ` · mocked: ${presetNames.join(", ")}` : "";
  if (engine === "native") {
    const rn = resolvePackageVersion("react-native", projectRoot);
    // The runtime is named because it is chosen automatically: a test that passes
    // alone but fails after other files is the hot-runtime signal, and this is the
    // line that tells someone reading the log that it is in play.
    const runtime = hotRuntime ? ", hot runtime" : "";
    console.error(
      `[vitest-native] engine: native — real react-native${rn ? `@${rn}` : ""}${mocked} (platform ${platform}${runtime})`,
    );
  } else {
    console.error(
      `[vitest-native] engine: mock — React Native reimplementation, cross-checked against real RN${mocked} (platform ${platform})`,
    );
  }
}

/**
 * The presets a mock-engine worker applies, for the banner. An array is the list the
 * workers are handed (the project context's `presetNames`). Otherwise each worker
 * detects its own (setup.ts: every auto-detected preset not switched off), so this is
 * a second computation of that list, not a read of it: both read AUTO_DETECT_PRESETS
 * through presetForInstalled, from the same project root, and agree as long as the
 * package resolves the same way from the main process and the worker. The native
 * engine's banner prints the list its workers are handed.
 */
function mockEnginePresetNames(
  listed: readonly Preset[] | null,
  presetsOption: unknown,
  projectRoot: string,
): string[] {
  if (listed) return listed.map((p) => p.name);
  const disabled = disabledPresetNames(presetsOption);
  // Diagnostics off: the workers log the detection themselves.
  return autoDetectPresetNames(projectRoot, false).filter((n) => !disabled.has(n));
}

/** The major of a version string, or NaN. */
function majorOf(version: string | null | undefined): number {
  return Number(version?.replace(/^[^0-9]*/, "").split(".")[0]);
}

function getJsxTransformConfig(viteMajor: number): JsxTransformConfig {
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
 * The Metro asset-module generator (native/assets.mjs). It ships as runtime `.mjs`
 * for the Node hooks, so — like the registry builder below — it is reached through a
 * computed dynamic import: a static specifier would bundle a second copy into the
 * plugin entry.
 */
let assetModules: AssetModules | null = null;
async function loadAssetModules(): Promise<AssetModules> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return (await import(pathToFileURL(path.resolve(dir, "native/assets.mjs")).href)) as AssetModules;
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

/** The registry-process module, reached as buildRegistryFor explains. */
async function loadRegistryProcess(): Promise<{
  startRegistryBuild: (o: object) => {
    registry?: string | null;
    pending?: { file: string; since: number };
  };
  settleRegistryBuilds: (budgetMs: number) => Promise<void>;
  stopRegistryBuilds: () => Promise<void>;
}> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return import(pathToFileURL(path.resolve(dir, "native/registry-process.mjs")).href);
}

/**
 * The warm registry, or the registry this cache miss is compiling in the background
 * (startRegistryBuild in native/registry-process.mjs). Neither when none is available.
 */
async function startRegistryFor(options: {
  projectRoot: string;
  platform: string;
  reactNativeVersion: string;
  assetExts: string[];
  sourceExts: string[];
  diagnostics: boolean;
}): Promise<{ registry?: string; pending?: { file: string; since: number } }> {
  try {
    const { registry, pending } = (await loadRegistryProcess()).startRegistryBuild(options);
    if (registry) return { registry };
    return pending ? { pending } : {};
  } catch (error) {
    console.warn(
      `[vitest-native] (native) could not precompile the React Native registry ` +
        `(${(error as Error)?.message ?? error}); using slower per-file module loading.`,
    );
    return {};
  }
}

/** Vitest instances whose close already settles the background registry builds. */
const registrySettlers = new WeakSet<object>();

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

/** Fields of every context this process wrote, by reference. */
const writtenContexts = new Map<string, ProjectContextFields>();

/**
 * The worker environment for one project: its fields become one context file, and
 * workers get only the reference. `env` (the memory plan, read back from the config)
 * passes through.
 */
function withProjectContext(
  fields: ProjectContextFields,
  env: Record<string, string>,
  projectRoot: string,
): Record<string, string> {
  const ref = writeProjectContext(fields, cacheRootFor(projectRoot));
  writtenContexts.set(ref, fields);
  return { ...env, [CONTEXT_ENV]: ref };
}

/**
 * `env` for Vitest's module-cache key, with the context reference replaced by its
 * fields minus the registry's. Whether the registry is warm, compiling or absent
 * changes how workers load React Native through Node, never what Vite transforms, so
 * a run that found the cache cold must not key every module differently from the
 * warm run after it.
 */
function registryNeutralEnv(env: unknown): unknown {
  const ref = (env as Record<string, unknown> | undefined)?.[CONTEXT_ENV];
  const fields = typeof ref === "string" ? writtenContexts.get(ref) : undefined;
  if (!fields) return env;
  const { registry: _registry, registryPending: _pending, ...rest } = fields;
  return { ...(env as Record<string, unknown>), [CONTEXT_ENV]: rest };
}

/** The same context with `changes` applied, written as its own file. */
function amendProjectContext(
  ref: string,
  changes: Partial<ProjectContextFields>,
  projectRoot: string,
): string {
  const current = writtenContexts.get(ref) ?? projectContext(ref);
  if (!current) throw new VitestNativeError("CONTEXT_INVALID", `no project context at ${ref}`);
  const fields = { ...current, ...changes } as ProjectContextFields;
  const next = writeProjectContext(fields, cacheRootFor(projectRoot));
  writtenContexts.set(next, fields);
  return next;
}

/**
 * Settings that were `VITEST_NATIVE_*` environment variables before the project
 * context. Set by hand in the shell or `test.env`, they no longer reach the workers,
 * so the plugin says so once.
 */
const RETIRED_VARIABLES = new Set(
  (
    "PLATFORM DIAGNOSTICS PROJECT_ROOT RN_VERSION TRANSFORM SOURCE_EXTS ASSET_EXTS " +
    "HOT_PRESERVE_GLOBALS RN_REGISTRY OWNERSHIP PROJECT_DIRS REQUIRE_ALIASES " +
    "REQUIRE_ALIASES_SKIPPED PRESET_NAMES PRESET_CONFIG PRESET_EXPORTS PRESET_MODULES " +
    "PRESET_DISABLED MOCKS RN_NATIVE_MODULES RN_NATIVE_MODULE_SPECS NATIVE_MODULES"
  )
    .split(" ")
    .map((name) => `VITEST_NATIVE_${name}`),
);
let warnedRetired = false;
function warnRetiredVariables(...sources: Array<Record<string, unknown> | undefined>): void {
  if (warnedRetired) return;
  const found = [
    ...new Set(
      sources.flatMap((env) => Object.keys(env ?? {}).filter((k) => RETIRED_VARIABLES.has(k))),
    ),
  ];
  if (found.length === 0) return;
  warnedRetired = true;
  console.warn(
    `[vitest-native] ${found.join(", ")} ${found.length === 1 ? "is" : "are"} set but no ` +
      `longer read: workers take their configuration from reactNative()'s options, ` +
      `through the project context. Set the matching option instead.`,
  );
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
  const root = projectRoot ?? process.cwd();
  const { listed, modulePaths } = selectPresets(options.presets, root);
  let builtIn: Preset[];
  if (listed) {
    builtIn = listed;
  } else {
    const detected = await autoDetectPresets(diagnostics, root);
    const disabled = disabledPresetNames(options.presets);
    builtIn = detected.filter(
      (p) => !disabled.has(p.name) && autoDetectedPresetApplies(p.name, engine, options.presets),
    );
  }
  const presets = [...builtIn, ...(await loadPresetModules(modulePaths, root))];

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
 * Handles platform-specific module resolution, Metro-shaped asset modules, preset virtual
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

/** What the `presets` option selects, read once per project root. */
export interface PresetSelection {
  /** vitest-native's presets an array lists, or null when auto-detection chooses them. */
  listed: Preset[] | null;
  /** The project's own preset modules, as absolute paths (see preset-modules.mjs). */
  modulePaths: string[];
  /** The same modules as the config names them (`'./my-preset.ts'`), for the banner. */
  moduleSpecs: string[];
}

/**
 * The `presets` option, read. An array lists vitest-native's presets, which each worker
 * rebuilds by name, and preset module paths. An object keeps auto-detection: `false`
 * switches a preset off, and a key that is not one of vitest-native's names, set to
 * `true`, adds a preset module. Paths resolve against the project root.
 */
export function selectPresets(
  option: VitestNativeOptions["presets"],
  root: string,
): PresetSelection {
  if (Array.isArray(option)) {
    const listed: Preset[] = [];
    const modulePaths: string[] = [];
    const moduleSpecs: string[] = [];
    for (const entry of option as unknown[]) {
      if (typeof entry === "string") {
        modulePaths.push(resolvePresetModule(entry, root));
        moduleSpecs.push(entry);
      } else listed.push(listedBuiltInPreset(entry));
    }
    return { listed, modulePaths, moduleSpecs };
  }
  const modulePaths: string[] = [];
  const moduleSpecs: string[] = [];
  if (option !== null && typeof option === "object") {
    for (const [key, enabled] of Object.entries(option)) {
      if (enabled === true && !Object.hasOwn(PRESET_MODULES, key)) {
        modulePaths.push(resolvePresetModule(key, root));
        moduleSpecs.push(key);
      }
    }
  }
  return { listed: null, modulePaths, moduleSpecs };
}

/**
 * An array entry that is not a path: one of vitest-native's presets, exactly as its
 * factory returned it. Workers rebuild these by name, so anything else (a preset of the
 * project's own, or a built-in one copied or changed) would not reach them; it used to
 * shadow its packages with modules whose every export was undefined.
 */
function listedBuiltInPreset(entry: unknown): Preset {
  if (typeof entry === "function") {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `An entry of "presets" is the preset factory ${entry.name || "(anonymous)"} itself; ` +
        `call it: presets.${entry.name || "<name>"}().`,
    );
  }
  const preset = entry as Preset & { [BUILT_IN_PRESET]?: string };
  if (preset === null || typeof preset !== "object" || typeof preset.name !== "string") {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `Each entry of "presets" must be a preset (presets.reanimated(), ...) or the path of a ` +
        `preset module; received ${JSON.stringify(entry)}.`,
    );
  }
  const name = preset.name;
  if (!Object.hasOwn(PRESET_MODULES, name)) {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `The preset '${name}' is not one of vitest-native's, and a preset object ` +
        `cannot reach the test workers, which build each preset's modules. Default-export ` +
        `it (or a function returning it) from a module, and list that module's path ` +
        `instead: presets: ['./test/presets/${name}.ts'].`,
    );
  }
  const own = (PRESET_MODULES as Record<string, readonly string[]>)[name]!;
  const modules =
    preset.modules !== null && typeof preset.modules === "object" ? preset.modules : {};
  if (preset[BUILT_IN_PRESET] !== name || !Object.keys(modules).every((m) => own.includes(m))) {
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `This '${name}' preset is not the one presets.${name}() returns: it is a copy, or its ` +
        `modules were added to or changed. The test workers rebuild vitest-native's presets ` +
        `by name, so the changes would not reach them. List presets.${name}() as it is, and ` +
        `put modules of your own in a preset module with a name of its own, listed by path.`,
    );
  }
  return preset;
}

function resolvePresetModule(specifier: string, root: string): string {
  if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
    const file = path.resolve(root, specifier);
    if (!fs.existsSync(file)) {
      throw new VitestNativeTypeError(
        "INVALID_OPTION",
        `The preset module '${specifier}' does not exist (resolved from ${root} to ${file}).`,
      );
    }
    return file;
  }
  // A package name resolves as require() resolves it. Its entry is then imported as an
  // ES module (loadPresetModules), so a package whose `exports` offer only `import`
  // does not resolve here; its file's path does.
  try {
    return createRequire(path.join(root, "package.json")).resolve(specifier);
  } catch (cause) {
    const notExported = (cause as { code?: string }).code === "ERR_PACKAGE_PATH_NOT_EXPORTED";
    throw new VitestNativeTypeError(
      "INVALID_OPTION",
      `The preset module '${specifier}' does not resolve from ${root}` +
        (notExported
          ? `: its package exports no entry for require(). List the preset file's path instead.`
          : `. vitest-native's own presets are named ${Object.keys(PRESET_MODULES).join(", ")}.`),
      { cause },
    );
  }
}

/**
 * React Native while a preset module is imported in the plugin's process. The module
 * may import it at its top level, as an app module does, but React Native's own source
 * (Flow) cannot load in Node, and nothing there runs a factory: each name is bound,
 * to undefined. The workers import the module again over the engine's React Native.
 */
const PRESET_MODULE_RN = "\0vitest-native:preset-module-react-native";
const REACT_NATIVE_IMPORT = /^react-native(\/|$)/;
const presetModuleReactNative: Plugin = {
  name: "vitest-native:preset-module-react-native",
  enforce: "pre",
  resolveId(id) {
    return id === "react-native" || id.startsWith("react-native/") ? PRESET_MODULE_RN : undefined;
  },
  load(id) {
    if (id !== PRESET_MODULE_RN) return undefined;
    return [
      "export default {};",
      ...RN_EXPORT_NAMES.map((name) => `export const ${name} = undefined;`),
    ].join("\n");
  },
};

/** Imports preset modules in the plugin's process, for their names and export names. */
async function loadPresetModules(files: string[], root: string): Promise<Preset[]> {
  if (files.length === 0) return [];
  const { runnerImport } = await import("vite");
  const presets: Preset[] = [];
  for (const file of files) {
    // configFile: false, so the project's own Vite config (which lists this plugin)
    // is not loaded again to import one module.
    let module: unknown;
    try {
      ({ module } = await runnerImport(file, {
        root,
        configFile: false,
        logLevel: "error",
        plugins: [presetModuleReactNative],
        // A bare import is otherwise handed to Node before any plugin resolves it.
        // `resolve.noExternal` is Vite 8's spelling for every environment;
        // `ssr.noExternal` is Vite 6 and 7's.
        resolve: { noExternal: [REACT_NATIVE_IMPORT] },
        ssr: { noExternal: [REACT_NATIVE_IMPORT] },
      } as Parameters<typeof runnerImport>[1]));
    } catch (cause) {
      throw new VitestNativeError(
        "INVALID_OPTION",
        `The preset module ${file} could not be imported while the plugin read its preset: ` +
          `${cause instanceof Error ? cause.message : String(cause)}\n` +
          `The plugin imports it in Node, with only react-native stood in, before any test ` +
          `runs. It must be an ES module (export default), and anything else React Native ` +
          `needs (another React Native library, the app's code) belongs inside its ` +
          `factories, which run in the test workers.`,
        { cause },
      );
    }
    presets.push(presetFromModule(module, file) as unknown as Preset);
  }
  const seen = new Set<string>();
  for (const preset of presets) {
    if (Object.hasOwn(PRESET_MODULES, preset.name)) {
      throw new VitestNativeTypeError(
        "INVALID_OPTION",
        `A preset module's preset is named '${preset.name}', which is one of vitest-native's ` +
          `presets. It needs a name of its own.`,
      );
    }
    if (seen.has(preset.name)) {
      throw new VitestNativeTypeError(
        "INVALID_OPTION",
        `Two preset modules' presets are named '${preset.name}'. Each needs a name of its own.`,
      );
    }
    seen.add(preset.name);
  }
  return presets;
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
 * `setupFilesAfterEnv`. Moving the entries into the user's list (and out of the merged
 * result) keeps a single copy of each at the front, in order.
 */
function prependSetupFile(userConfig: UserConfig, contributed: { setupFiles?: unknown }): void {
  const ours = contributed.setupFiles as string[];
  const userTest = ((userConfig as { test?: { setupFiles?: unknown } }).test ??= {});
  const existing = userTest.setupFiles;
  const userFiles = Array.isArray(existing) ? existing : existing == null ? [] : [existing];
  if (userFiles.length === 0) return;
  userTest.setupFiles = [...ours, ...userFiles.filter((f) => !ours.includes(f))];
  contributed.setupFiles = [];
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
 * 5). The hot runtime's memory plan caps workers (at most four unless the user set the
 * count), while a project beside it gets Vitest's default of one fewer than the CPUs,
 * so a native project next to a mock or non-React-Native project failed on any machine
 * with more than five cores. Mirrors Vitest's resolveMaxWorkers and its grouping,
 * including the exemption for a single-worker isolated project in the default group.
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
type HostResolver = {
  resolveId?: (id: string, importer?: string) => Promise<{ id: string } | string | null>;
};

/** An enforced hot memory plan and what configureVitest needs to rebuild it. */
type HotMemorySelection = {
  plan: HotMemoryPlan;
  /** The options object the hot pool reads as it creates each worker. */
  poolOptions: NativePoolOptions;
  /** hotRuntime.memoryLimit was set, so the plan does not choose the heap threshold. */
  userMemoryLimit: boolean;
  /** A plan for a worker count the user chose (memory admission, no automatic cap). */
  replan: (requestedWorkers: number) => HotMemoryPlan;
  formatPlan: (plan: HotMemoryPlan) => string[];
  /** config() capped the user's count; configureVitest warns if hot still runs. */
  capWarning: boolean;
};

function warnWorkersCapped(requestedWorkers: number, plan: HotMemoryPlan): void {
  console.warn(
    `[vitest-native] hotRuntime capped maxWorkers from ${requestedWorkers} to ` +
      `${plan.maxWorkers} for the ${plan.source} memory budget. ` +
      `Set diagnostics:true to see the full envelope.`,
  );
}

function printHotMemoryPlan(lines: readonly string[]): void {
  for (const line of lines) console.log(`[vitest-native] memory: ${line}`);
}

/**
 * Rebuild the hot memory plan for the worker count Vitest resolved, when it is not the
 * count config() planned for. Vitest applies `--maxWorkers` and `VITEST_MAX_WORKERS`
 * over the `maxWorkers` every config hook returned (resolveConfig in Vitest 4.1 and 5;
 * Vitest 5 also copies `--maxWorkers` into each project), and config() never sees the
 * environment variable: `VITEST_MAX_WORKERS=10` ran ten workers on a heap threshold
 * and plan sized for four. The count is the user's explicit choice, so memory
 * admission alone bounds it, as it does for one in the config file. Sets the
 * project's `maxWorkers` to the admitted count and returns the new plan, which takes
 * effect through applyHotMemoryPlan; returns undefined when the plan already fits.
 * Vitest 5 hands config() `--maxWorkers` too, so a memory-capped request comes back
 * here as the same plan config() built and warned about; that is not a new plan.
 */
function replanForVitestWorkers(
  memory: HotMemorySelection,
  projectConfig: { maxWorkers?: unknown },
): HotMemoryPlan | undefined {
  const workers = projectConfig.maxWorkers;
  if (typeof workers !== "number" || workers === memory.plan.maxWorkers) return undefined;
  const plan = memory.replan(workers);
  projectConfig.maxWorkers = plan.maxWorkers;
  const unchanged =
    plan.maxWorkers === memory.plan.maxWorkers &&
    plan.requestedWorkers === memory.plan.requestedWorkers;
  return unchanged ? undefined : plan;
}

/**
 * Hand a rebuilt plan to everything that consumes it. The hot pool reads its options as
 * Vitest creates each worker, and Vitest passes `env` to workers as it starts them;
 * both happen when the run starts, after every configureVitest hook has returned.
 */
function applyHotMemoryPlan(
  memory: HotMemorySelection,
  plan: HotMemoryPlan,
  projectConfig: { env?: Record<string, string> },
  diagnostics: boolean,
): void {
  memory.plan = plan;
  memory.poolOptions.memoryPlan = plan;
  if (!memory.userMemoryLimit) memory.poolOptions.memoryLimit = plan.workerHeapLimit;
  projectConfig.env ??= {};
  projectConfig.env.VITEST_NATIVE_MEMORY_PLAN = JSON.stringify({ ...plan, enforced: true });
  if (plan.maxWorkers < plan.requestedWorkers) warnWorkersCapped(plan.requestedWorkers, plan);
  if (diagnostics) {
    console.log(
      `[vitest-native] memory: plan rebuilt for the ${plan.requestedWorkers} workers ` +
        `Vitest resolved after config (--maxWorkers or VITEST_MAX_WORKERS)`,
    );
    printHotMemoryPlan(memory.formatPlan(plan));
  }
}

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
    {
      pool: unknown;
      userPool: unknown;
      userMaxWorkers: unknown;
      singleWorkerAccepted: boolean;
      // The enforced memory plan and what it was built from, so configureVitest can
      // rebuild it for a worker count Vitest applied after config(). Absent under
      // allowUnboundedMemory, which leaves the worker count to Vitest.
      memory?: HotMemorySelection;
    }
  >();
  // Project roots this instance configured for the native engine, and the setup file
  // it gave each project root.
  const nativeRoots = new Set<string>();
  const contributedSetup = new Map<string, string>();
  // Each root's preset module → named exports, or null for a module whose package is
  // not installed (not shadowed), for the setup files (see configureVitest).
  const presetExportsByRoot = new Map<string, Record<string, string[] | null>>();
  // This plugin's part of Vitest's persistent transform cache key, per root (see
  // fs-module-cache.ts).
  const cacheKeys = new Map<string, string>();
  let warnedMissingJestMockTransform = false;
  let warnedTsconfigPaths = false;
  // The version of the Vite running this config, from the host rather than the package
  // named `vite` (host.ts). Set at the start of config(); every version decision reads it.
  let hostViteVersion: string | null = null;
  let hostViteSource = "";

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

      // As a file with each extension, then as a directory with an index file.
      const candidate =
        firstExact(absolute, extensions) ?? firstExact(path.join(absolute, "index"), extensions);
      if (candidate !== null) {
        resolveCache.set(cacheKey, candidate);
        return candidate;
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

  // Runs after the mock engine's setup file and awaits its presets' preparation
  // (shipped verbatim; see the file).
  const presetReadyPath = path.resolve(thisDir, "preset-ready.mjs");
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
  // Off by default, as in 0.13.0: each file runs in a fresh worker until the hot
  // runtime's known per-file differences are detected and recovered (troubleshooting
  // guide). 'auto' opts in: the bounded hot runtime where config-time evidence shows
  // it is safe, per-file isolation otherwise, with the reason for any decline printed.
  const hotRuntimeExplicit = options?.hotRuntime !== undefined;
  const hotRuntimeOpt = options?.hotRuntime ?? false;
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
  // gates), asset subpaths (fonts/images, loaded from their real files), and
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

    // For sibling plugins: jestMockTransform() asks who owns a module before it moves a
    // factory's `jest.requireActual` to Vite (jest-compat/transform.ts). Null until
    // config() has built the policy, and under the mock engine.
    api: {
      nativeOwnership: (): NativeOwnershipPolicy | null => nativeOwnership,
    },

    // This plugin is `enforce:"pre"` for resolution/transform semantics, but its
    // config decision is wrapped as an order:"post" hook below. Automatic hot
    // selection must see pools and setup files contributed by later plugins.
    async config(userConfig, _env) {
      const hostVite = await runningVite(this);
      hostViteVersion = hostVite?.version ?? null;
      hostViteSource = hostVite?.source ?? "";
      // Serialize options that need to cross from the Vite main process
      // into Vitest worker processes. globalThis does NOT survive this
      // boundary — we use test.env to inject process.env vars instead.
      //
      // Resolve the project root as Vitest does: `test.root` (or `--root`), then Vite's
      // `root`, then process.cwd(). Vitest makes `test.root` Vite's root too, so this is
      // the root configResolved sees; the workers resolve packages from it. This must
      // happen here (not configResolved) because test.env is captured before
      // configResolved runs.
      const resolvedRoot = vitestRootOf(userConfig);
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
      const jsxTransform = getJsxTransformConfig(majorOf(hostViteVersion));
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
          `engine:'native' requires react-native, a React Native Babel preset ` +
            `('@react-native/babel-preset', or Expo's from SDK 56), and '@babel/core' ` +
            `to resolve from ${resolvedRoot} — missing: ` +
            `${decision.missing.join(", ")}. React Native and Expo projects ship all ` +
            `three by default. Install what's missing (react-native as a dependency, the ` +
            `toolchain as devDependencies), or set engine:'mock' to run without a ` +
            `React Native install.`,
        );
      }
      // The fallback notice is a warning — a team that believes it is testing real
      // React Native while running the mock is the exact failure mode the engine
      // split exists to prevent.
      if (decision.notice) console.warn(decision.notice);
      // Each engine's branch below prints the banner once it knows the presets (and,
      // for the native engine, the runtime).
      warnRetiredVariables(
        process.env,
        (userConfig as { test?: { env?: Record<string, unknown> } }).test?.env,
      );
      // What workers get: the project context's fields, and `env` for the few
      // variables read back from the config in this process (the memory plan).
      const fields: ProjectContextFields = { platform, diagnostics, projectRoot: resolvedRoot };
      const env: Record<string, string> = {};
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
      const viteMajorForPaths = majorOf(hostViteVersion);
      if (
        userTsconfigPaths === true ||
        expoTsconfigPaths(resolvedRoot, userTsconfigPaths, viteMajorForPaths) === "enable"
      ) {
        requireAliases.entries.push(...tsconfigPathAliases(resolvedRoot).entries);
      }
      if (requireAliases.entries.length > 0) fields.requireAliases = requireAliases.entries;
      if (requireAliases.skipped.length > 0) fields.requireAliasesSkipped = requireAliases.skipped;
      const reactNativeVersion = resolvePackageVersion("react-native", resolvedRoot);
      if (reactNativeVersion) fields.reactNativeVersion = reactNativeVersion;
      // The native modules a device would have registered, read once here from the
      // installed React Native rather than by every worker (see native-modules.mjs).
      if (engine === "native") {
        fields.knownNativeModules = knownNativeModulesFor(resolvedRoot);
        fields.nativeModuleSpecs = nativeModuleSpecsFor(resolvedRoot);
        if (options?.nativeModules === "permissive") fields.nativeModules = "permissive";
      }
      // Asset extensions for the Node require hook (matches the Vite graph): a CJS
      // `require('./logo.png')` reaching Node's loader must become a Metro-shaped
      // asset module (native/assets.mjs), not be compiled as JS.
      fields.assetExts = assetExtList;
      if (metroOption === true || typeof metroOption === "object") {
        fields.sourceExts = sourceExts;
      }
      if (hotRuntimeRequested && hotRecycle.preserveGlobals?.length) {
        fields.hotPreserveGlobals = hotRecycle.preserveGlobals;
      }
      // Only the opt-out is recorded: the setup file defaults this on under hot.
      if (hotRuntimeRequested && hotRecycle.esmGeneration === false) {
        fields.hotEsmGeneration = false;
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
        // Presets apply to the native engine too: native-runtime libs (Reanimated
        // worklets, gesture-handler natives) can't run in Node and must be shadowed
        // by the same self-contained mocks the mock engine uses. We
        // resolve which presets are active here (sync) and hand the names to the
        // native setup file via env; it builds the mocks in-worker. The actual
        // import redirection happens in resolveId/load (virtual:preset modules).
        const disabledNative = disabledPresetNames(options?.presets);
        const selection = selectPresets(options?.presets, resolvedRoot);
        const nativePresetNames = selection.listed
          ? selection.listed.map((p) => p.name)
          : autoDetectPresetNames(resolvedRoot, diagnostics).filter(
              (n) =>
                !disabledNative.has(n) && autoDetectedPresetApplies(n, "native", options?.presets),
            );
        if (nativePresetNames.length > 0) {
          fields.presetNames = nativePresetNames;
        }
        if (selection.modulePaths.length > 0) {
          fields.presetModules = selection.modulePaths;
        }
        // Per-preset config (e.g. navigation({ defaultRouteParams })) must travel to
        // the worker, where presets are rebuilt from their name. Only explicitly
        // configured presets carry config; auto-detected ones use their defaults.
        if (selection.listed) {
          const presetConfig: Record<string, Record<string, unknown>> = {};
          for (const p of selection.listed) {
            if (p.config && Object.keys(p.config).length > 0) presetConfig[p.name] = p.config;
          }
          if (Object.keys(presetConfig).length > 0) {
            fields.presetConfig = presetConfig;
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
          fields.projectDirs = projectDirs;
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
              replan: (requestedWorkers: number) => HotMemoryPlan;
              formatPlan: (plan: HotMemoryPlan) => string[];
              capWarning: boolean;
            }
          | undefined;
        if (hotRuntimeRequested) {
          const { createHotMemoryPlan, formatHotMemoryPlan, resolveRequestedWorkers } =
            await import("./native/memory.mjs");
          const requestedWorkers = resolveRequestedWorkers(userTest?.maxWorkers, {
            fileParallelism: userTest?.fileParallelism,
          });
          // A worker count the user set is bounded by memory alone; the four-worker
          // cap applies to the automatic choice (see createHotMemoryPlan).
          const plan = createHotMemoryPlan({
            requestedWorkers,
            explicitWorkers: userTest?.maxWorkers != null,
          });
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
                `batches every file into one unrecyclable task. ` +
                // admittedWorkers is memory's figure, uncapped for a count the user set,
                // so name whichever of the two chose one worker.
                (plan.admittedWorkers < 2
                  ? `The effective ${plan.source} memory ceiling admits only one worker. `
                  : `This config selects one worker (maxWorkers or fileParallelism). `) +
                `Use hotRuntime:false, provide enough ` +
                `memory for at least two workers, or explicitly accept unbounded growth with ` +
                `hotRuntime:{ allowUnboundedMemory:true }.`,
            );
          }
          // Only memory caps a worker count the user set, and running fewer workers
          // than they asked for is worth a line even when 'auto' chose hot.
          // configureVitest prints it, once it knows hot still runs: under 'auto' a
          // group conflict can hand the project back to Vitest's own count.
          const capWarning =
            autoDeclineReason === null &&
            !allowUnboundedMemory &&
            userTest?.maxWorkers != null &&
            plan.maxWorkers < requestedWorkers;
          if (autoDeclineReason === null && diagnostics) {
            printHotMemoryPlan(formatHotMemoryPlan(plan));
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
              replan: (count) =>
                createHotMemoryPlan({ requestedWorkers: count, explicitWorkers: true }),
              formatPlan: formatHotMemoryPlan,
              capWarning,
            };
          }
        }

        const registryOptions = {
          projectRoot: resolvedRoot,
          platform,
          reactNativeVersion: reactNativeVersion ?? "0.0.0",
          assetExts: assetExtList,
          sourceExts,
          diagnostics,
        };
        // On a cache miss the registry compiles in the background and this run loads
        // React Native file by file, which is the same React Native; a test file that
        // starts after the registry lands uses it (startRegistryBuild records why, and
        // the options rejected). A hot worker serves many files from one boot, and holds
        // React Native resident without the registry, so the hot runtime still waits
        // for it. VITEST_NATIVE_REGISTRY_WAIT=1 restores waiting everywhere.
        if (hotMemory || process.env.VITEST_NATIVE_REGISTRY_WAIT === "1") {
          const registryFile = await buildRegistryFor(registryOptions);
          if (registryFile) fields.registry = registryFile;
        } else {
          const { registry, pending } = await startRegistryFor(registryOptions);
          if (registry) fields.registry = registry;
          else if (pending) fields.registryPending = pending;
        }

        // Lazy import: pulls in vitest/node, which only exists when running under
        // Vitest (not plain Vite). Memory admission above deliberately has no
        // Vitest dependency, so it can run before the registry optimization.
        let hot:
          | { pool: PoolRunnerInitializer; runnerPath: string; maxWorkers?: number }
          | undefined;
        let hotPoolOptions: NativePoolOptions | undefined;
        if (hotMemory) {
          const { nativePool } = await import("./native/pool.js");
          hotPoolOptions = {
            workerEntry: nativeWorkerPath,
            projectRoot: resolvedRoot,
            recycleAfterFiles: hotRecycle.recycleAfterFiles,
            memoryLimit: hotMemory.memoryLimit,
            memoryPlan: hotMemory.plan,
            allowUnboundedMemory: hotMemory.allowUnboundedMemory,
            diagnostics,
          };
          hot = {
            pool: nativePool(hotPoolOptions),
            runnerPath: nativeRunnerPath,
            maxWorkers: hotMemory.allowUnboundedMemory ? undefined : hotMemory.plan.maxWorkers,
          };
        }
        printEngineBanner(
          engine,
          platform,
          resolvedRoot,
          [...nativePresetNames, ...selection.moduleSpecs],
          hot !== undefined,
        );
        if (hot) {
          hotSelections.set(vitestRootOf(userConfig), {
            pool: hot.pool,
            userPool,
            userMaxWorkers: userTest?.maxWorkers,
            singleWorkerAccepted: hotMemory?.allowUnboundedMemory === true,
            memory:
              hotMemory && hotPoolOptions && !hotMemory.allowUnboundedMemory
                ? {
                    plan: hotMemory.plan,
                    poolOptions: hotPoolOptions,
                    userMemoryLimit: hotRecycle.memoryLimit !== undefined,
                    replan: hotMemory.replan,
                    formatPlan: hotMemory.formatPlan,
                    capWarning: hotMemory.capWarning,
                  }
                : undefined,
          });
        } else {
          hotSelections.delete(vitestRootOf(userConfig));
        }
        const nativeConfig = nativeEngineConfig(
          nativeSetupPath,
          fields,
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
        );
        nativeConfig.test.env = withProjectContext(fields, env, resolvedRoot);
        return asCompatibleViteConfig(nativeConfig);
      }

      // --- mock engine (existing behaviour) ---
      if (hotRuntimeRequested && hotRuntimeExplicit) {
        console.warn(
          `[vitest-native] 'hotRuntime' only applies to engine:'native' (resolved engine: '${engine}'); ignoring.`,
        );
      }
      // Custom mock overrides (validated above to be serializable).
      if (options?.mocks && Object.keys(options.mocks).length > 0) {
        fields.mocks = options.mocks;
      }

      // An explicit ARRAY is the full list, so setup.ts must not auto-detect. The
      // object form keeps detection — the worker does that itself — and only needs to
      // know which names to drop. `resolved` is not assigned until configResolved,
      // so neither branch can read it here.
      const selection = selectPresets(options?.presets, resolvedRoot);
      printEngineBanner(engine, platform, resolvedRoot, [
        ...mockEnginePresetNames(selection.listed, options?.presets, resolvedRoot),
        ...selection.moduleSpecs,
      ]);
      if (selection.modulePaths.length > 0) {
        fields.presetModules = selection.modulePaths;
      }
      if (selection.listed) {
        fields.presetNames = selection.listed.map((p) => p.name);
      } else {
        const disabled = disabledPresetNames(options?.presets);
        if (disabled.size > 0) {
          fields.presetDisabled = [...disabled];
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
          setupFiles: [setupFilePath, presetReadyPath],
          env: withProjectContext(fields, env, resolvedRoot),
        },
      });
    },

    async configResolved(config) {
      // load() is synchronous for assets; it needs the module generator in hand.
      assetModules ??= await loadAssetModules();

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
        // Vitest is checked in configureVitest against the running instance: under a
        // wrapper such as Vite+ the project root may not resolve `vitest` at all. Here only
        // a Vitest found by name and older than the range is refused, so that Vitest 2 and
        // 3 (whose configureVitest is missing or differs) still stop by name.
        if (name === "vitest") {
          const found = resolvePackageVersion("vitest", config.root);
          if (found === null || !(majorOf(found) < 4)) continue;
        }
        const error = validatePeerDependency(
          name,
          minimum,
          config.root,
          maximumMajor,
          minimumByMajor,
          name === "vite" ? hostViteVersion : undefined,
          name === "vite" ? hostViteSource : undefined,
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
      // With the engine decided in config(): `auto` reaching resolveOptions read as the
      // mock engine, so presets the native engine does not apply were redirected anyway.
      resolved = await resolveOptions({ ...options, engine }, config.root, {
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

      // Build preset module lookup and read export names.
      // Export names are read here, at Vite config time, without calling the
      // factory (which requires vitest, only available in worker processes). Most
      // are a static list; a module with exportsFor (skia) reads its own from the
      // package installed at the project root, and is not shadowed when there is none.
      const exportsByModule: Record<string, string[] | null> = {};
      for (const preset of resolved.presets) {
        let shadows = false;
        for (const [moduleName, presetModule] of Object.entries(preset.modules)) {
          const names = presetModule.exportsFor
            ? presetModule.exportsFor({ projectRoot: config.root, platform: resolved.platform })
            : presetModule.exports;
          exportsByModule[moduleName] = names;
          if (names === null) continue;
          shadows = true;
          presetModules.set(moduleName, presetModule.factory);
          presetExportNames.set(moduleName, names);
        }
        // A preset listed by hand that finds none of its packages would shadow nothing,
        // and the real package would load in its place (an auto-detected one is only
        // active when its package resolves).
        const readsInstalled = Object.values(preset.modules).some((m) => m.exportsFor);
        if (!shadows && readsInstalled && Array.isArray(options?.presets)) {
          throw new VitestNativeError(
            "PRESET_UNAVAILABLE",
            `The ${preset.name} preset is listed in \`presets\`, and none of its packages ` +
              `(${Object.keys(preset.modules).join(", ")}) resolves from the project root, ` +
              `${config.root}. Set the Vitest project's \`root\` to the package that ` +
              `depends on them.`,
          );
        }
      }
      presetExportsByRoot.set(vitestRootOf(config), exportsByModule);

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
        // A preset can shadow a subpath as a module of its own
        // (react-native-unistyles/reanimated); that module serves it, not the
        // package root's mock with the subpath as a leaf.
        const pkg = presetExportNames.has(specifier) ? specifier : packageNameOf(specifier);
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
                `if (!_hit && ${diagnostics}) console.warn(${JSON.stringify(
                  `[vitest-native] '${specifier}' has no matching export on the '${pkg}' preset mock; serving the root mock namespace.`,
                )});`,
                `export default (_hit ? _m[${JSON.stringify(leaf)}] : ${fallback});`,
              ]
            : [`export default ${fallback};`]),
        ].join("\n");
        virtualCodeCache.set(id, code);
        return code;
      }

      // Asset imports evaluate to what Metro's asset modules evaluate to: the id
      // React Native's asset registry assigns to the asset's Metro descriptor (see
      // native/assets.mjs). Under the native engine that is React Native's real
      // registry, reached through Node's loader like the rest of React Native, so
      // Image.resolveAssetSource finds it; under the mock engine it is the mock's
      // AssetRegistry, which the mock's resolveAssetSource reads.
      const fsPath = stripFsPrefix(id);
      if (assetPattern.test(fsPath)) {
        // configResolved loads it; Vite never calls load() before that hook.
        if (!assetModules) {
          throw new VitestNativeError(
            "TRANSFORM_FAILED",
            `asset '${fsPath}' was loaded before the plugin's configResolved hook ran.`,
          );
        }
        const assetOptions = { projectRoot: alignRoot || process.cwd(), platform };
        return engine === "native"
          ? assetModules.nativeAssetModuleSource(fsPath, { ...assetOptions, format: "esm" })
          : assetModules.mockAssetModuleSource(fsPath, assetOptions);
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

  // Vitest calls this once projects are resolved with CLI options applied and before
  // any worker starts: the last point at which the runtime can still change.
  function configureProject({
    vitest,
    project,
    defineCacheKeyGenerator,
    experimental_defineCacheKeyGenerator,
  }: {
    // Vitest 5; Vitest 4.0.11 and later 4.x spell it experimental_defineCacheKeyGenerator.
    defineCacheKeyGenerator?: (generator: () => string) => void;
    experimental_defineCacheKeyGenerator?: (generator: () => string) => void;
    vitest: {
      version?: string;
      distPath?: string;
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
      // The project's Vite server, for asking its resolver what `vitest` resolves to.
      vite?: {
        pluginContainer?: HostResolver;
        environments?: Record<string, { pluginContainer?: HostResolver } | undefined>;
      };
    };
  }) {
    const projectConfig = project.config;
    const root = projectConfig.root ? path.resolve(projectConfig.root) : process.cwd();
    // The running Vitest, as Vitest states it, rather than the package a lookup from the
    // project root finds (host.ts).
    if (typeof vitest.version === "string") {
      const vitestPeer = PEER_REQUIREMENTS.find((peer) => peer.name === "vitest");
      const error =
        vitestPeer &&
        validatePeerDependency(
          "vitest",
          vitestPeer.minimum,
          root,
          vitestPeer.maximumMajor,
          vitestPeer.minimumByMajor,
          vitest.version,
        );
      if (error)
        throw new VitestNativeError(
          "UNSUPPORTED_PEER",
          `Unsupported peer dependencies:\n- ${error}`,
        );
    }
    if (!registrySettlers.has(vitest)) {
      registrySettlers.add(vitest);
      const closable = vitest as {
        onClose?: (fn: () => Promise<void>) => void;
        onCancel?: (fn: () => Promise<void>) => void;
        config?: { teardownTimeout?: number };
      };
      // A cancelled run (Ctrl-C in a terminal) exits without waiting for the build.
      closable.onCancel?.(async () => {
        await (await loadRegistryProcess()).stopRegistryBuilds();
      });
      // Vitest gives its whole close `teardownTimeout` before it reports a hang and
      // exits; leave it a second of that.
      const budgetMs = (closable.config?.teardownTimeout ?? 10_000) - 1000;
      closable.onClose?.(async () => {
        await (await loadRegistryProcess()).settleRegistryBuilds(budgetMs);
      });
    }
    const cacheKey = cacheKeys.get(root);
    if (cacheKey)
      (defineCacheKeyGenerator ?? experimental_defineCacheKeyGenerator)?.(() => cacheKey);
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
    // The setup files take each preset module's named exports, and whether it is
    // shadowed at all, from here rather than reading them again in the worker: the
    // skia preset reads its own by parsing the installed package with Vite, which
    // would load Vite into every test file's worker (and leave a global behind that
    // the hot runtime cannot remove).
    const presetExports = presetExportsByRoot.get(root);
    const contextRef = projectConfig.env?.[CONTEXT_ENV];
    if (typeof contextRef === "string") {
      // The project Vitest runs must be the one its context describes: a shared Vite
      // server or an inline project that kept another project's context would run
      // with another project's configuration.
      const own = writtenContexts.get(contextRef) ?? projectContext(contextRef);
      if (own && own.projectRoot !== root) {
        throw new VitestNativeError(
          "CONTEXT_INVALID",
          `the project context is invalid (project): the Vitest project at ${root} ` +
            `was handed the context for ${own.projectRoot}. Give each project its own ` +
            `\`root\`, or report this, with the Vitest config, as a vitest-native bug.`,
        );
      }
      const ref = presetExports
        ? amendProjectContext(contextRef, { presetExports }, root)
        : contextRef;
      projectConfig.env![CONTEXT_ENV] = ref;
      // A cache cleared during a watch session: rewrite the file before each rerun.
      const fields = writtenContexts.get(ref);
      if (fields) {
        (vitest as { onTestsRerun?: (fn: () => void) => void }).onTestsRerun?.(() => {
          projectConfig.env![CONTEXT_ENV] = ensureProjectContext(
            projectConfig.env![CONTEXT_ENV] ?? ref,
            fields,
          );
        });
      }
    }
    const cli = vitest._cliOptions ?? vitest.config?.cliOptions ?? {};
    // On Vitest 4 a `--pool` flag arrives after config(), past its check.
    if (nativeRoots.has(root) && isVmPool(cli.pool)) throw vmPoolUnsupported(cli.pool);
    // Skia's own mock, which the skia preset serves, require()s react-native through
    // Node. Under the mock engine that require reaches the React Native mock through
    // the CommonJS bridge (cjs-bridge.ts), which a VM pool's context does not use, so
    // it would load React Native's Flow source and fail every test file.
    const pool = cli.pool ?? projectConfig.pool;
    if (isVmPool(pool) && PRESET_MODULES.skia.some((name) => presetExports?.[name])) {
      throw new VitestNativeError(
        "UNSUPPORTED_POOL",
        `The skia preset cannot run on the '${pool}' pool: Skia's test mock loads ` +
          `react-native through Node's require, which a VM pool's context does not route ` +
          `to the React Native mock. Use 'threads' (the default) or 'forks', or turn the ` +
          `preset off: reactNative({ presets: { skia: false } }).`,
      );
    }
    const selection = hotSelections.get(root);
    if (!selection) return;
    const override = hotOverrideReason(
      projectConfig,
      cli,
      selection.pool,
      selection.singleWorkerAccepted,
    );
    // Before the group check, which must compare the worker count hot will run.
    const vitestWorkers = projectConfig.maxWorkers;
    const replanned =
      override === null && selection.memory
        ? replanForVitestWorkers(selection.memory, projectConfig)
        : undefined;
    const reason =
      override ??
      sharedGroupConflict(project, vitest.projects ?? [], {
        maxWorkers: vitest.config?.maxWorkers,
        watch: vitest.config?.watch,
      });
    if (reason === null) {
      if (replanned && selection.memory) {
        applyHotMemoryPlan(selection.memory, replanned, projectConfig, diagnostics);
      } else if (selection.memory?.capWarning) {
        warnWorkersCapped(selection.memory.plan.requestedWorkers, selection.memory.plan);
      }
      if (selection.memory) selection.memory.capWarning = false;
      return;
    }
    // Hot is off, so the count Vitest resolved applies as it stood.
    projectConfig.maxWorkers = vitestWorkers;
    if (!hotRuntimeAuto) throw hotRuntimeOverridden(reason);
    projectConfig.pool = cli.pool ?? selection.userPool ?? "threads";
    projectConfig.isolate = cli.isolate ?? true;
    projectConfig.runner = undefined;
    // The memory plan may have capped the worker count; give back Vitest's own.
    if (cli.maxWorkers === undefined && !process.env.VITEST_MAX_WORKERS) {
      projectConfig.maxWorkers =
        projectConfig.fileParallelism === false
          ? 1
          : selection.userMaxWorkers === undefined &&
              vitest.config !== projectConfig &&
              typeof vitest.config?.maxWorkers === "number" &&
              vitestRootOf(vitest.config as { root?: unknown }) !== root
            ? // The root's resolved count, which a project without its own inherits.
              // Not undefined: Vitest resolved each project's count before this hook
              // and groups projects by project.config.maxWorkers as it stands, so an
              // unset count beside a plain project's failed the run (Vitest 5).
              // Only a root this plugin did not plan: an `extends: true` project
              // shares its root, whose count config() already set to the plan.
              vitest.config.maxWorkers
            : vitestMaxWorkers(selection.userMaxWorkers, vitest.config?.watch === true);
    }
    if (projectConfig.env) delete projectConfig.env.VITEST_NATIVE_MEMORY_PLAN;
    hotSelections.delete(root);
    // The engine banner already said "hot runtime"; keep the log truthful.
    console.error(`[vitest-native] hot runtime off: ${reason}; Vitest's settings apply.`);
  }

  /**
   * Refuse a run in which vitest-native's own `import 'vitest'` would reach a different
   * physical Vitest from the one running (host.ts): through the project's Vite resolver
   * for the setup file, and through Node for the hot runtime's worker.
   */
  async function verifyRunningVitest({
    vitest,
    project,
  }: Parameters<typeof configureProject>[0]): Promise<void> {
    if (typeof vitest.version !== "string" || typeof vitest.distPath !== "string") return;
    const running = { version: vitest.version, distPath: vitest.distPath };
    const root = project.config.root ? path.resolve(project.config.root) : process.cwd();
    if (hotSelections.has(root)) assertHotWorkerLoadsRunningVitest(running, nativeWorkerPath);
    const setupFile = contributedSetup.get(root);
    const container =
      project.vite?.environments?.__vitest__?.pluginContainer ?? project.vite?.pluginContainer;
    const resolveId = container?.resolveId?.bind(container);
    if (!setupFile || resolveId === undefined) return;
    await assertHostResolvesRunningVitest(running, resolveId, setupFile);
  }

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
          // config() runs before Vitest hands over its instance, and Vitest builds the
          // module cache before configureVitest, so the running version is not available
          // here. The project root's copy decides, as before; under Vite+ (no `vitest` at
          // the root) the copy this package resolves stands in.
          const vitestMajor = majorOf(
            resolvePackageVersion("vitest", viteRoot) ?? ownVitestPackage()?.version,
          );
          const userTest = (
            userConfig as { test?: Parameters<typeof shouldDefaultFsModuleCache>[1] }
          ).test;
          if (shouldDefaultFsModuleCache(vitestMajor, userTest)) {
            (test as { fsModuleCache?: boolean }).fsModuleCache = true;
          }
          cacheKeys.set(
            vitestRootOf(userConfig),
            fsModuleCacheKey(
              path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
              viteRoot,
              { options, env: registryNeutralEnv((test as { env?: unknown }).env) },
            ),
          );
        }
        if (test) {
          const viteRoot = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
          const viteMajor = majorOf(hostViteVersion);
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
    // any worker starts: the last point at which the runtime can still change. Vitest
    // awaits it, which the check of the running Vitest needs (the host's resolver is
    // asynchronous).
    configureVitest(context: Parameters<typeof configureProject>[0]) {
      configureProject(context);
      return verifyRunningVitest(context);
    },
  } as Plugin;
}
