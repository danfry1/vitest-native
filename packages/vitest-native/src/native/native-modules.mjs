// Which native modules exist under the native engine.
//
// On a device, a native module exists when the app binary registers it. React
// Native's own lookups say so plainly (react-native/Libraries/TurboModule/
// TurboModuleRegistry.js): `get(name)` returns null for an unregistered name,
// `getEnforcing(name)` throws, and `NativeModules[name]` is undefined. Jest's React
// Native preset behaves the same way: its NativeModules mock is a plain object of a
// few core modules (react-native/jest/mocks/NativeModules.js), and the real
// TurboModuleRegistry falls back to it. Library code relies on this for feature
// detection — expo-constants reads `NativeModules.EXDevLauncher.manifestString`
// only when `NativeModules.EXDevLauncher` is present.
//
// Tests have no binary, so "registered" has to come from somewhere else. The
// source of truth is React Native itself: every module name its own JavaScript
// requests, read from the installed copy. Those are the modules every React Native
// app binary ships, and React Native's JS cannot run without them. Reading them
// from the installed package, rather than keeping a list here, means the set
// follows whichever React Native version the project uses.
//
// The boundary (native/boundary.mjs) adds to this set the modules vitest-native
// itself implements (constants it serves, NitroModules) and any module a test
// registers with mockNativeModule().
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { projectContext } from "../context.mjs";

/** Where React Native's JavaScript lives, relative to the package root. */
export const REACT_NATIVE_SOURCE_DIRS = ["Libraries", "src"];

/**
 * Directories inside those that are React Native's own tests and test doubles,
 * not code an app runs.
 */
const SKIPPED_DIRS = new Set(["__tests__", "__mocks__", "__flowtests__", "__fixtures__"]);

/** Modules vitest-native implements at the boundary, beyond React Native's own. */
export const BOUNDARY_NATIVE_MODULES = Object.freeze([
  // native/nitro.mjs: install() puts Nitro's JSI proxy on the global.
  "NitroModules",
]);

const CALL_RE = /TurboModuleRegistry\s*\.\s*(get|getEnforcing)\b/g;
// `TurboModuleRegistry.get<Spec>('Name')`, including the multi-line form the
// formatter produces for long names. The type argument never contains a paren.
const NAMED_CALL_RE =
  /TurboModuleRegistry\s*\.\s*(get|getEnforcing)\s*(?:<[^()]*?>)?\s*\(\s*(['"])([^'"]+)\2/g;
// `NativeModules.Name`, `NativeModules?.Name`, `NativeModules['Name']`.
const NATIVE_MODULES_RE =
  /\bNativeModules\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)|\bNativeModules\s*(?:\?\.)?\s*\[\s*(['"])([^'"]+)\2\s*\]/g;

/**
 * Comments describe lookups without performing them (NativeModules.js documents
 * `NativeModules.ModuleName`), so they are removed before matching. The line form
 * keeps `://` in URLs intact.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

function walk(dir, files) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".js")) files.push(full);
  }
}

const SPEC_RE = /\binterface\s+Spec\s+extends\s+TurboModule\s*\{/g;

/**
 * The members of each `interface Spec extends TurboModule { ... }` in a source file:
 * the methods (and getConstants) the module's codegen spec declares, which are the
 * only properties its native object has on a device. Members are the names directly
 * inside the interface body; names nested in parameter or object types sit deeper
 * and are skipped.
 */
export function specMembers(source) {
  const members = new Set();
  for (const match of source.matchAll(SPEC_RE)) {
    let depth = 1;
    let atMemberStart = true;
    for (let i = match.index + match[0].length; i < source.length && depth > 0; i++) {
      const c = source[i];
      if (c === "{" || c === "(" || c === "[") depth++;
      else if (c === "}" || c === ")" || c === "]") depth--;
      else if (depth === 1 && (c === ";" || c === "," || c === "\n")) atMemberStart = true;
      else if (depth === 1 && atMemberStart && !/\s/.test(c)) {
        atMemberStart = false;
        // Variance is `+name` (Flow, React Native <= 0.86) or `readonly name` (0.87+).
        const member = /^(?:\+|-|readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/.exec(source.slice(i));
        if (member) members.add(member[1]);
      }
    }
  }
  return members;
}

/**
 * Every native module name React Native's own JavaScript requests, by lookup kind.
 * `unnamed` counts TurboModuleRegistry calls whose argument is not a string
 * literal; React Native's specs always pass a literal, and a test holds the
 * installed copy to that, so a change upstream cannot silently shrink the set.
 */
export function scanReactNativeModuleRequests(reactNativeRoot) {
  const files = [];
  for (const dir of REACT_NATIVE_SOURCE_DIRS) walk(path.join(reactNativeRoot, dir), files);
  const get = new Set();
  const getEnforcing = new Set();
  const nativeModules = new Set();
  const specs = new Map();
  let unnamed = 0;
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.includes("TurboModuleRegistry") && !raw.includes("NativeModules")) continue;
    const source = stripComments(raw);
    let named = 0;
    const members = specMembers(source);
    for (const match of source.matchAll(NAMED_CALL_RE)) {
      (match[1] === "get" ? get : getEnforcing).add(match[3]);
      named++;
      // A spec file declares the interface and looks the module up with it.
      if (members.size > 0) {
        const known = specs.get(match[3]) ?? new Set();
        for (const member of members) known.add(member);
        specs.set(match[3], known);
      }
    }
    // The registry's own module defines get/getEnforcing; it requests nothing.
    if (!file.replace(/\\/g, "/").endsWith("/Libraries/TurboModule/TurboModuleRegistry.js")) {
      unnamed += (source.match(CALL_RE) || []).length - named;
    }
    for (const match of source.matchAll(NATIVE_MODULES_RE)) {
      nativeModules.add(match[1] ?? match[3]);
    }
  }
  const sorted = (set) => [...set].sort();
  return {
    files: files.length,
    get: sorted(get),
    getEnforcing: sorted(getEnforcing),
    nativeModules: sorted(nativeModules),
    specs: Object.fromEntries(
      [...specs.keys()].sort().map((name) => [name, sorted(specs.get(name))]),
    ),
    unnamed,
  };
}

/** The installed React Native's package root, as `react-native` resolves from the project. */
export function reactNativeRootFor(projectRoot) {
  try {
    const req = createRequire(path.join(projectRoot, "package.json"));
    return path.dirname(fs.realpathSync(req.resolve("react-native/package.json")));
  } catch {
    return null;
  }
}

const memo = new Map();

/** The installed React Native's scan, memoized per React Native root. */
function scanFor(projectRoot) {
  const root = reactNativeRootFor(projectRoot);
  if (root === null) return null;
  let scan = memo.get(root);
  if (!scan) {
    scan = scanReactNativeModuleRequests(root);
    memo.set(root, scan);
  }
  return scan;
}

/**
 * The module names React Native's JavaScript requests, plus the boundary's own,
 * sorted. Memoized per React Native root: the scan reads ~600 files (~60-80ms
 * measured on 0.78-0.87), and several Vitest projects in one run share a copy.
 */
export function knownNativeModulesFor(projectRoot) {
  const scan = scanFor(projectRoot);
  if (scan === null) return [...BOUNDARY_NATIVE_MODULES];
  return [
    ...new Set([
      ...scan.get,
      ...scan.getEnforcing,
      ...scan.nativeModules,
      ...BOUNDARY_NATIVE_MODULES,
    ]),
  ].sort();
}

/** Each React Native module's spec members, by module name (see specMembers). */
export function nativeModuleSpecsFor(projectRoot) {
  return scanFor(projectRoot)?.specs ?? {};
}

// --- The Expo runtime ---
//
// The Expo runtime an app runs in, as its native modules show it: Expo Go, or a
// development build (`reactNative({ expo: { runtime: 'development-build' } })`).
//
// Expo's JavaScript tells the two apart only by asking the native side, so the runtime
// is a handful of native-module facts. Each one below is read from Expo's own source,
// and tests/expo-runtime-facts.test.ts reads that source again, so an Expo release that
// changes one fails by name:
//
//   - `ExpoGo` is registered only by the Expo Go app. expo's isRunningInExpoGo() is
//     `requireNativeModule('ExpoGo') != null` (expo/src/environment/ExpoGo.ts), and
//     expo-asset and @expo/log-box ask the same way. A development build has no such
//     module, so every lookup finds nothing.
//   - `EXDevLauncher` is registered by expo-dev-launcher in a debug build (iOS
//     ios/EXDevLauncher.m `RCT_EXPORT_MODULE()`; Android DevLauncherModule.kt in the
//     debug source set, `getName() = "EXDevLauncher"`), a legacy bridge module expo reads
//     as `NativeModules.EXDevLauncher` (expo/src/Expo.fx.tsx). Its only members are the
//     constants `manifestString` and `manifestURL`, set once an app is loaded from a
//     manifest. It is seeded without them, so expo-constants keeps its own manifest
//     (expo-constants/src/Constants.ts reads `manifestString` only when it is set).
//   - expo-constants' native module reports `executionEnvironment: 'bare'` and no
//     `appOwnership` outside Expo Go (ios/EXConstantsObjC/EXConstantsService.m and
//     android/.../ConstantsService.kt), which Constants.ts turns into
//     `appOwnership: null`. Expo Go replaces that service with its own.
//
// Nothing in expo-modules-core differs between the two: it reads no runtime-specific
// module. The default (no option, or `'expo-go'`) models nothing here and keeps the
// engine's long-standing behaviour, which follows jest-expo.
/** The values `expo.runtime` accepts. `'expo-go'` is the default, spelled out. */
export const EXPO_RUNTIMES = Object.freeze(["expo-go", "development-build"]);

/** The package that registers `EXDevLauncher`, and the one apps install to get it. */
export const DEV_LAUNCHER_PACKAGE = "expo-dev-launcher";
export const DEV_CLIENT_PACKAGE = "expo-dev-client";

/**
 * The native-module facts of `runtime`, or null when it models none (Expo Go, the
 * default).
 *
 * `modules`: whether each named module exists, and for a present one with `members`,
 * exactly which members it has. `constants`: members an Expo module's seed takes
 * instead of its default (a member set to undefined is one the module lacks).
 *
 * @param {string | undefined} runtime
 * @param {{ devLauncher: boolean }} installed
 */
export function expoRuntimeFacts(runtime, { devLauncher }) {
  if (runtime !== "development-build") return null;
  return {
    modules: {
      ExpoGo: { present: false },
      EXDevLauncher: devLauncher ? { present: true, members: [] } : { present: false },
    },
    constants: {
      ExponentConstants: { executionEnvironment: "bare", appOwnership: undefined },
    },
  };
}

/** The directory of `name` as Node finds it from `fromDir`, walking up node_modules. */
function packageDirFrom(fromDir, name) {
  for (let dir = path.resolve(fromDir); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      try {
        return fs.realpathSync(candidate);
      } catch {
        return candidate;
      }
    }
    if (path.dirname(dir) === dir) return null;
  }
}

/**
 * Whether the project installs expo-dev-launcher: directly, or as expo-dev-client's
 * dependency, which a strict layout (pnpm) leaves beside expo-dev-client rather than at
 * the project root. Read from disk, not through `exports`.
 */
export function devLauncherInstalled(projectRoot) {
  if (packageDirFrom(projectRoot, DEV_LAUNCHER_PACKAGE)) return true;
  const devClient = packageDirFrom(projectRoot, DEV_CLIENT_PACKAGE);
  return devClient !== null && packageDirFrom(devClient, DEV_LAUNCHER_PACKAGE) !== null;
}

// The boundary's module sources run inside React Native's module scope, where only
// globals reach them, so the shared check and its settings are published on one global:
// `present` and `runtime` below, `permissive` (`nativeModules: 'permissive'`) and `expo`
// (the facts of `expo: { runtime }`, expoRuntimeFacts), which installKnownNativeModules
// sets from the project context. Created as this module loads: every path that loads the
// boundary (setup file, hot worker) imports it.
const presence = (globalThis.__vitest_native_module_presence ??= {
  permissive: false,
  expo: null,
});

/**
 * The Expo runtime's answer for a module (expoRuntimeFacts): `{ present, members? }`, or
 * undefined when the runtime says nothing about it. A React Native core module (`core`:
 * one React Native's own JavaScript requests, or one the boundary serves constants for)
 * is never made absent: React Native's JavaScript cannot run without it.
 */
export function runtimeModule(name, core = false) {
  const modules = presence.expo?.modules;
  if (!modules || !Object.hasOwn(modules, name)) return undefined;
  const answer = modules[name];
  if (!answer.present && (core || (globalThis.__vitest_native_known_modules?.has(name) ?? false))) {
    return undefined;
  }
  return answer;
}

/**
 * Whether a native module exists: the one answer both registries give, the React Native
 * boundary's (`NativeModules`, `TurboModuleRegistry`) and `globalThis.expo.modules`.
 * Each passes the layers it has; the first that answers decides, most specific first:
 *
 *   1. `mocked`: a test registered it with mockNativeModule(). Present.
 *   2. The Expo runtime (`expo: { runtime }`), for the modules it names. Never absent
 *      for a React Native core module (`core`).
 *   3. `seeded`: the registry serves the module itself (the boundary's device constants;
 *      an Expo package's own mock of its native module). Present.
 *   4. `scanned`: what the scans of installed packages say (React Native's own lookups;
 *      names Expo packages probe for that nothing installed defines), when they say.
 *   5. `nativeModules: 'permissive'`: present. Otherwise absent.
 *
 * Read at lookup time: the setup file installs the inputs, and mocks change during a test.
 * expo.modules never passes `mocked`: it does not serve a test's mock, so a mocked Expo
 * name reaches the mock through TurboModuleRegistry, where expo-modules-core looks next.
 *
 * @param {string} name
 * @param {{ mocked?: boolean, core?: boolean, seeded?: boolean, scanned?: boolean }} layers
 */
export function modulePresent(
  name,
  { mocked = false, core = false, seeded = false, scanned } = {},
) {
  if (mocked) return true;
  const runtime = runtimeModule(name, core);
  if (runtime !== undefined) return runtime.present;
  if (seeded) return true;
  if (scanned !== undefined) return scanned;
  return presence.permissive === true;
}

presence.present = modulePresent;
presence.runtime = runtimeModule;

/**
 * Publish the known set (globalThis.__vitest_native_known_modules) and each known
 * module's spec members (globalThis.__vitest_native_module_specs) to the boundary.
 * The plugin computes both once and passes them in the project context; without that
 * (a setup file run outside the plugin), they are computed here from the project.
 */
export function installKnownNativeModules(projectRoot) {
  const context = projectContext();
  // The plugin's `nativeModules: 'permissive'`, read by the boundary at lookup time.
  presence.permissive = context?.nativeModules === "permissive";
  // The plugin's `expo: { runtime }`, read the same way. The plugin records whether
  // expo-dev-launcher is installed; a setup file run outside it reads that here.
  const runtime = context?.expoRuntime;
  presence.expo = runtime
    ? expoRuntimeFacts(runtime, {
        devLauncher: context.expoDevLauncher ?? devLauncherInstalled(projectRoot),
      })
    : null;
  if (!(globalThis.__vitest_native_known_modules instanceof Set)) {
    const names = context?.knownNativeModules;
    globalThis.__vitest_native_known_modules = new Set(
      Array.isArray(names) ? names.map(String) : knownNativeModulesFor(projectRoot),
    );
  }
  if (!(globalThis.__vitest_native_module_specs instanceof Map)) {
    const specs = context?.nativeModuleSpecs;
    globalThis.__vitest_native_module_specs = new Map(
      Object.entries(
        specs !== null && typeof specs === "object" ? specs : nativeModuleSpecsFor(projectRoot),
      ).map(([name, members]) => [name, new Set(members)]),
    );
  }
}
