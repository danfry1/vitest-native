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

/**
 * The environment variable carrying the known set from the plugin (computed once,
 * in the main process) to the workers.
 */
export const KNOWN_NATIVE_MODULES_ENV = "VITEST_NATIVE_RN_NATIVE_MODULES";

/** Set to "permissive" by the plugin's `nativeModules: 'permissive'` option. */
export const PERMISSIVE_NATIVE_MODULES_ENV = "VITEST_NATIVE_NATIVE_MODULES";

/** The same, for each module's spec members. */
export const NATIVE_MODULE_SPECS_ENV = "VITEST_NATIVE_RN_NATIVE_MODULE_SPECS";

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

const fromEnv = (name) => {
  try {
    return JSON.parse(process.env[name] || "null");
  } catch {
    // Unreadable: recompute rather than run with an empty set.
    return null;
  }
};

/**
 * Publish the known set (globalThis.__vitest_native_known_modules) and each known
 * module's spec members (globalThis.__vitest_native_module_specs) to the boundary.
 * The plugin computes both once and passes them in the environment; without that
 * (a setup file run outside the plugin), they are computed here from the project.
 */
export function installKnownNativeModules(projectRoot) {
  if (!(globalThis.__vitest_native_known_modules instanceof Set)) {
    const names = fromEnv(KNOWN_NATIVE_MODULES_ENV);
    globalThis.__vitest_native_known_modules = new Set(
      Array.isArray(names) ? names.map(String) : knownNativeModulesFor(projectRoot),
    );
  }
  if (!(globalThis.__vitest_native_module_specs instanceof Map)) {
    const specs = fromEnv(NATIVE_MODULE_SPECS_ENV);
    globalThis.__vitest_native_module_specs = new Map(
      Object.entries(
        specs !== null && typeof specs === "object" ? specs : nativeModuleSpecsFor(projectRoot),
      ).map(([name, members]) => [name, new Set(members)]),
    );
  }
}
