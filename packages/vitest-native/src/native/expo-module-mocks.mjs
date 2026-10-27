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

const packageLists = new Map();
const indexes = new Map();
const nativeNames = new Map();

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
 * The native module names the installed Expo modules define, or null when none are
 * found (a layout this does not recognise, where every name stays present).
 *
 * A native module exists on a device when an installed package's native code defines
 * it, and that code names it: `Name("ExpoHaptics")` in Swift and Kotlin, or a constant
 * holding the string. Every string literal in the packages' native sources is
 * collected, a superset of the module names. A module a package only probes for
 * (expo-image's requireOptionalNativeModule("ExpoObserve"), defined by expo-observe)
 * is then absent unless its own package is installed, as on a device.
 *
 * Reading the sources takes about 100 ms for a typical app's Expo modules, so the set
 * for installed packages is cached on disk, keyed by every package's path and version.
 * A package edited in place without a version change (patch-package) is not seen
 * until the cache under node_modules/.cache/vitest-native is cleared.
 */
export function expoNativeModuleNames(projectRoot, cacheDir) {
  if (nativeNames.has(projectRoot)) return nativeNames.get(projectRoot);
  const packages = expoModulePackages(projectRoot);
  let names = null;
  if (packages.length > 0) {
    // Installed packages change with their version, so they are cached by it. Sources
    // outside node_modules (local modules, file: and workspace links) change in place,
    // so they are read every time.
    const installed = packages.filter((pkgDir) => NODE_MODULES_DIR.test(realpath(pkgDir)));
    const local = packages.filter((pkgDir) => !installed.includes(pkgDir));
    const key = crypto
      .createHash("sha1")
      .update(`v${NATIVE_NAMES_VERSION}`)
      .update(installed.map((pkgDir) => `${pkgDir}@${packageVersion(pkgDir)}`).join("\0"))
      .digest("hex")
      .slice(0, 16);
    const file = cacheDir ? path.join(cacheDir, `expo-native-modules-${key}.json`) : null;
    names = readCachedNames(file);
    if (!names) {
      names = scanNativeNames(installed);
      if (file) writeCachedNames(file, names);
    }
    for (const name of scanNativeNames(local)) names.add(name);
  }
  nativeNames.set(projectRoot, names);
  return names;
}

// Bump when what is collected changes, so a cached set from an older scan is not reused.
const NATIVE_NAMES_VERSION = 1;
const NATIVE_SOURCE = /\.(swift|kt|java|m|mm)$/;
const NODE_MODULES_DIR = /[\\/]node_modules[\\/]/;
const STRING_LITERAL = /"([A-Za-z][A-Za-z0-9_]{2,})"/g;

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

function readCachedNames(file) {
  if (!file) return null;
  try {
    return new Set(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

function writeCachedNames(file, names) {
  if (fs.existsSync(file)) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Written to a temporary name and renamed, so a concurrent worker never reads half.
    const tmp = `${file}.${process.pid}.${threadId}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...names]));
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
