// The mocks Expo modules ship for their own native modules.
//
// A package built with the Expo modules API has an `expo-module.config.json`, and
// expo-modules-test-core generates `mocks/<NativeModuleName>.ts` for it: functions
// with representative return values (expo-crypto's digestStringAsync resolves a
// string, expo-file-system's documentDirectory is a path). jest-expo serves them when
// a package calls requireNativeModule or requireOptionalNativeModule: it finds the
// calling package from the stack, wraps each function in jest.fn and keeps classes
// unwrapped so `extends` still works (jest-expo src/preset/setup.js, attemptLookup and
// requireMockModule). Without them, the engine's generic stub answered every member
// with a no-op, so code reading a value at import time failed: expo-file-system/legacy
// calls normalizeEndingSlash(documentDirectory) as it loads.
//
// The packages are found by name instead of by stack: an index of every installed
// Expo module's mocks/ directory, keyed by native module name, which is the file
// jest-expo's lookup reaches.
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { threadId } from "node:worker_threads";
import expoModuleTable from "./expo-module-table.mjs";

// Per module instance: once per worker under the hot runtime, once per test file with
// isolation (about 15 ms there, with the on-disk scan cache warm).
const packageLists = new Map();
const indexes = new Map();
const absentModules = new Map();
const tableSdkMatches = new Map();

/**
 * The Expo modules (directories with an expo-module.config.json) for `projectRoot`, in
 * resolution order. First the project's local modules, which Expo autolinks from
 * `modules/` (or `expo.autolinking.nativeModulesDir`); then up the tree, as Node
 * resolves (a hoisted workspace installs packages above the project), nearest first;
 * within a node_modules, every package before the copies nested inside them (npm nests
 * a package's own version: expo/node_modules/expo-asset); then pnpm's store.
 */
export function expoModulePackages(projectRoot) {
  let list = packageLists.get(projectRoot);
  if (list) return list;
  list = [];
  const declared = declaredDependencies(projectRoot);
  const add = (pkgDir) => {
    if (fs.existsSync(path.join(pkgDir, "expo-module.config.json"))) list.push(pkgDir);
  };
  for (const pkgDir of packageDirs(localModulesDir(projectRoot))) add(pkgDir);
  for (let dir = path.resolve(projectRoot); ; dir = path.dirname(dir)) {
    const nodeModules = path.join(dir, "node_modules");
    // Every package here: an Expo module need not be named after Expo, or be declared
    // by the project (an SDK package's own native module), and one missed reads as
    // absent, so requireNativeModule throws. One stat each.
    const candidates = packageDirs(nodeModules);
    for (const pkgDir of candidates) add(pkgDir);
    for (const pkgDir of candidates) {
      const nested = path.join(pkgDir, "node_modules");
      for (const nestedDir of packageDirs(nested)) {
        if (isCandidate(nestedDir, nested, declared)) add(nestedDir);
      }
    }
    // pnpm keeps transitive packages in its store, outside the project's node_modules.
    const store = path.join(nodeModules, ".pnpm");
    for (const entry of readdir(store)) {
      if (!/^(@expo\+)?expo/.test(entry)) continue;
      for (const pkgDir of packageDirs(path.join(store, entry, "node_modules"))) add(pkgDir);
    }
    if (path.dirname(dir) === dir) break;
  }
  packageLists.set(projectRoot, list);
  return list;
}

/** Native module name → mock file, for the Expo modules installed for `projectRoot`. */
export function expoModuleMockIndex(projectRoot) {
  let index = indexes.get(projectRoot);
  if (index) return index;
  index = new Map();
  for (const pkgDir of expoModulePackages(projectRoot)) addMocks(pkgDir, index);
  indexes.set(projectRoot, index);
  return index;
}

/**
 * The native modules an installed package only probes for and no installed package
 * defines, which a device does not have.
 *
 * A package that needs a module requires it (requireNativeModule); one that can do
 * without probes for it (requireOptionalNativeModule) and takes another path when it is
 * missing. expo-image probes for expo-observe's ExpoObserve, which exists only when
 * expo-observe is installed. A name is absent when an installed package's JavaScript
 * probes for it and no installed or local Expo module's native sources mention it (the
 * name appears there as `Name("ExpoHaptics")`, a constant, or an @ExpoModule argument,
 * so every string literal in the sources is collected, a superset of the names).
 *
 * Every other name stays present, including any this cannot account for: reading a
 * module that exists as absent makes requireNativeModule throw, while reading one
 * that does not as present only keeps the generic stub, as before. So a layout this
 * does not model (a library's own module under development, an unusual autolinking
 * search path) cannot break an import.
 *
 * Reading the installed packages takes a few hundred milliseconds, so it is cached on
 * disk, keyed by each package's path and version. A package edited in place without a
 * version change (patch-package) is seen once that cache is cleared. Local sources
 * (local modules, file: and workspace links) are read every time.
 */
export function expoAbsentModules(projectRoot, cacheDir) {
  if (absentModules.has(projectRoot)) return absentModules.get(projectRoot);
  const packages = expoModulePackages(projectRoot);
  const absent = new Set();
  if (packages.length > 0) {
    const installed = packages.filter((pkgDir) => isInstalled(projectRoot, pkgDir));
    const local = packages.filter((pkgDir) => !installed.includes(pkgDir));
    const key = crypto
      .createHash("sha1")
      .update(`v${SCAN_VERSION}`)
      .update(installed.map((pkgDir) => `${pkgDir}@${packageVersion(pkgDir)}`).join("\0"))
      .digest("hex")
      .slice(0, 16);
    const file = cacheDir ? path.join(cacheDir, `expo-native-modules-${key}.json`) : null;
    let scan = readCachedScan(file);
    if (!scan) {
      scan = { defined: scanNativeNames(installed), probed: scanProbedNames(installed) };
      if (file) writeCachedScan(file, scan);
    }
    const defined = new Set([...scan.defined, ...scanNativeNames(local)]);
    for (const name of scan.probed) if (!defined.has(name)) absent.add(name);
  }
  absentModules.set(projectRoot, absent);
  return absent;
}

// Bump when what is collected changes, so a cached scan from an older version is not reused.
const SCAN_VERSION = 2;
const NATIVE_SOURCE = /\.(swift|kt|java|m|mm)$/;
const JS_SOURCE = /\.(js|mjs|cjs|ts|tsx)$/;
const STRING_LITERAL = /"([A-Za-z][A-Za-z0-9_]{2,})"/g;
const OPTIONAL_PROBE = /requireOptionalNativeModule\s*(?:<[^>]*>)?\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g;

// Installed: inside a node_modules, relative to the project (a project whose own path
// passes through a node_modules directory still has local modules).
function isInstalled(projectRoot, pkgDir) {
  const relative = path.relative(realpath(projectRoot), realpath(pkgDir));
  return relative.split(path.sep).includes("node_modules");
}

function scanProbedNames(packages) {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirEntries(dir)) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(full);
      } else if (JS_SOURCE.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        let src;
        try {
          src = fs.readFileSync(full, "utf8");
        } catch {
          continue;
        }
        if (!src.includes("requireOptionalNativeModule")) continue;
        for (const match of src.matchAll(OPTIONAL_PROBE)) names.add(match[1]);
      }
    }
  };
  for (const pkgDir of packages) walk(pkgDir);
  return names;
}

const SKIPPED_DIRS = new Set(["node_modules", "ios", "android", "__tests__", "__mocks__", "mocks"]);

function scanNativeNames(packages) {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirEntries(dir)) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "build" && entry.name !== "node_modules") walk(full);
      } else if (NATIVE_SOURCE.test(entry.name)) {
        let src;
        try {
          src = fs.readFileSync(full, "utf8");
        } catch {
          continue;
        }
        for (const match of src.matchAll(STRING_LITERAL)) names.add(match[1]);
      }
    }
  };
  for (const pkgDir of packages) {
    walk(path.join(pkgDir, "ios"));
    walk(path.join(pkgDir, "android"));
  }
  return names;
}

function readCachedScan(file) {
  if (!file) return null;
  try {
    const { defined, probed } = JSON.parse(fs.readFileSync(file, "utf8"));
    return { defined: new Set(defined), probed: new Set(probed) };
  } catch {
    return null;
  }
}

function writeCachedScan(file, scan) {
  if (fs.existsSync(file)) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Written to a temporary name and renamed, so a concurrent worker never reads half.
    const tmp = `${file}.${process.pid}.${threadId}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ defined: [...scan.defined], probed: [...scan.probed] }));
    fs.renameSync(tmp, file);
  } catch {
    // An unwritable cache only costs the next worker the scan.
  }
}

function realpath(dir) {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}

function packageVersion(pkgDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")).version;
  } catch {
    return "0";
  }
}

function readdirEntries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// Nested copies are looked for only among Expo's own packages (expo-*, @expo/*) and
// what the project declares: checking every package's nested node_modules cost about
// 20 ms per test file on a 500-package install.
function isCandidate(pkgDir, nodeModules, declared) {
  const name = path.relative(nodeModules, pkgDir).split(path.sep).join("/");
  return name.startsWith("expo") || name.startsWith("@expo/") || declared.has(name);
}

function localModulesDir(projectRoot) {
  let configured;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    configured = manifest.expo?.autolinking?.nativeModulesDir;
  } catch {
    configured = undefined;
  }
  return path.resolve(projectRoot, typeof configured === "string" ? configured : "modules");
}

function declaredDependencies(projectRoot) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    return new Set(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }));
  } catch {
    return new Set();
  }
}

function packageDirs(nodeModules) {
  const dirs = [];
  for (const entry of readdir(nodeModules)) {
    if (entry.startsWith(".")) continue;
    if (entry.startsWith("@")) {
      for (const scoped of readdir(path.join(nodeModules, entry))) {
        dirs.push(path.join(nodeModules, entry, scoped));
      }
    } else {
      dirs.push(path.join(nodeModules, entry));
    }
  }
  return dirs;
}

function addMocks(pkgDir, index) {
  const mocks = path.join(pkgDir, "mocks");
  for (const file of readdir(mocks)) {
    const match = /^(.+)\.(ts|tsx|js)$/.exec(file);
    if (!match || file.endsWith(".d.ts")) continue;
    // The first copy found wins (see the order in expoModuleMockIndex).
    if (!index.has(match[1])) index.set(match[1], fs.realpathSync(path.join(mocks, file)));
  }
}

function readdir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * The members a package mock gives native module `name`, or null when no installed
 * package ships one (or it fails to load). Functions are wrapped with `mockFn`, as
 * jest-expo wraps them in jest.fn; classes are kept as they are.
 */
export function expoModuleMock(projectRoot, name, mockFn) {
  const file = expoModuleMockIndex(projectRoot).get(name);
  if (!file) return null;
  let exports;
  try {
    exports = createRequire(file)(file);
  } catch {
    return null;
  }
  const members = {};
  for (const [key, value] of Object.entries(exports)) {
    if (key === "__esModule") continue;
    const isClass =
      typeof value === "function" && Object.getOwnPropertyNames(value.prototype ?? {}).length > 1;
    members[key] = typeof value === "function" && !isClass ? mockFn(value) : value;
  }
  return members;
}

/**
 * The members jest-expo gives native module `name` from Expo's table of the native
 * modules (expo-module-table.mjs, extracted by scripts/sync-expo-module-table.mjs), or
 * null when the table has no such module. Values follow jest-expo's `mock()`
 * (src/preset/setup.js): a member's own `mock` value, else a function (resolving for
 * native async functions), `1` for a number, `'mock'` for a string, `[]` for an array,
 * and `{}` otherwise. A member newer than the table is not here; the caller keeps its
 * stub's conventions for those, and for every unlisted member when the table is another
 * SDK's (expoModuleTableDescribesInstalledSdk).
 */
export function expoModuleTableMembers(name, mockFn) {
  const members = expoModuleTable.modules[name];
  if (!members) return null;
  const out = {};
  for (const [member, property] of Object.entries(members)) {
    out[member] = jestExpoMockValue(property, mockFn);
  }
  return out;
}

/**
 * Whether Expo's table describes the SDK installed for `projectRoot`: the major of the
 * jest-expo it was extracted from (jest-expo's major is the SDK's) against the major of
 * the `expo` the project resolves. Only then is a member the table leaves out one the
 * module does not have; another SDK's modules have members this table never listed
 * (SDK 57's ExpoUpdates has a `manifest` constant), so false where expo is absent or
 * of another SDK.
 */
export function expoModuleTableDescribesInstalledSdk(projectRoot) {
  let installed = tableSdkMatches.get(projectRoot);
  if (installed !== undefined) return installed;
  const tableMajor = /@(\d+)\./.exec(expoModuleTable.source)?.[1];
  let expoMajor;
  try {
    const file = createRequire(path.join(projectRoot, "package.json")).resolve("expo/package.json");
    expoMajor = /^(\d+)\./.exec(JSON.parse(fs.readFileSync(file, "utf8")).version)?.[1];
  } catch {
    expoMajor = undefined;
  }
  installed = tableMajor !== undefined && expoMajor === tableMajor;
  tableSdkMatches.set(projectRoot, installed);
  return installed;
}

function jestExpoMockValue(property, mockFn) {
  // Copied, so one file's mutation of a shared value does not reach the next.
  if (property.mock !== undefined) return JSON.parse(JSON.stringify(property.mock));
  switch (property.type) {
    case "function":
      return property.functionType === "promise"
        ? mockFn(() => Promise.resolve())
        : mockFn(() => undefined);
    case "number":
      return 1;
    case "string":
      return "mock";
    case "array":
      return [];
    case "mock": {
      const out = {};
      for (const [key, definition] of Object.entries(property.mockDefinition ?? {})) {
        out[key] = {};
        for (const [member, inner] of Object.entries(definition)) {
          out[key][member] = jestExpoMockValue(inner, mockFn);
        }
      }
      return out;
    }
    default:
      return {};
  }
}
