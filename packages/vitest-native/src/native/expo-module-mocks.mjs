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
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const indexes = new Map();

/** Native module name → mock file, for the Expo modules installed for `projectRoot`. */
export function expoModuleMockIndex(projectRoot) {
  let index = indexes.get(projectRoot);
  if (index) return index;
  index = new Map();
  const declared = declaredDependencies(projectRoot);
  // Up the tree, as Node resolves (a hoisted workspace installs packages above the
  // project), nearest first; within a node_modules, its own packages before the copies
  // nested inside them (npm nests a package's own version: expo/node_modules/expo-asset).
  for (let dir = path.resolve(projectRoot); ; dir = path.dirname(dir)) {
    const nodeModules = path.join(dir, "node_modules");
    const candidates = packageDirs(nodeModules).filter((pkgDir) =>
      isCandidate(pkgDir, nodeModules, declared),
    );
    for (const pkgDir of candidates) addMocks(pkgDir, index);
    for (const pkgDir of candidates) {
      const nested = path.join(pkgDir, "node_modules");
      for (const nestedDir of packageDirs(nested)) {
        if (isCandidate(nestedDir, nested, declared)) addMocks(nestedDir, index);
      }
    }
    // pnpm keeps transitive packages in its store, outside the project's node_modules.
    const store = path.join(nodeModules, ".pnpm");
    for (const entry of readdir(store)) {
      if (!/^(@expo\+)?expo/.test(entry)) continue;
      for (const pkgDir of packageDirs(path.join(store, entry, "node_modules"))) {
        addMocks(pkgDir, index);
      }
    }
    if (path.dirname(dir) === dir) break;
  }
  indexes.set(projectRoot, index);
  return index;
}

// Expo's own packages (expo-*, @expo/*), and whatever the project declares, which is
// where a third-party Expo module comes from. Checking every installed package's
// directory cost about 20 ms per test file on a 500-package install.
function isCandidate(pkgDir, nodeModules, declared) {
  const name = path.relative(nodeModules, pkgDir).split(path.sep).join("/");
  return name.startsWith("expo") || name.startsWith("@expo/") || declared.has(name);
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
  if (!fs.existsSync(path.join(pkgDir, "expo-module.config.json"))) return;
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
