// Jest, as a library's own test support sees it.
//
// React Native libraries ship their test support for Jest: setup files that call
// `jest.mock` for their native modules (react-native-gesture-handler/jestSetup.js,
// @shopify/flash-list/jestSetup.js) and mocks that call `jest.fn` or import
// `@jest/globals` (react-native-safe-area-context/jest/mock). Under Vitest a global
// `jest` is Vitest's `vi`, whose `mock` never reaches Node's `require`, and a library
// file is not compiled by jestMockTransform, so such a setup file ran and changed
// nothing. Here a library's support files get a `jest` of their own, with Jest's
// semantics where they differ:
//
// - `jest.mock(spec, factory)` registers the factory in the per-file Node registry
//   (jest-compat/node-registry.mjs), keyed from the file that called it, so every
//   require of the module gets it, as under Jest's single registry;
// - `jest.requireActual` gives the module itself, past a preset's shadow;
// - `jest.fn`: an implementation a library installs while it builds its mocks
//   (`jest.fn().mockImplementation(...)`, `mockReturnValue(...)`) is the mock's own, so
//   `vi.resetAllMocks()` and `mockReset: true` return the mock to it, where Vitest would
//   drop it (the bug class mock-reset-fragile presets had, #278/#287);
// - `@jest/globals` required from such a file is the same `jest`.
//
// The `jest` reaches a file as a function parameter around its compiled code, never as
// `globalThis.jest`: code elsewhere (RNTL's fake-timer detection) reads `typeof jest` to
// decide whether it runs under Jest.
//
// A package's test support is active once one of its support entries loads: a request
// whose leaf is `jestSetup` or `mock`, a file under its `jest/` directory, or an Expo
// module's `mocks/<NativeModule>` file (the mock of its native module, which
// expo-modules-core generates for Jest; expo-font's calls `jest.fn` and
// `jest.requireActual`), whether a preset loads it, the Expo module resolver does
// (expo-module-mocks.mjs), or a suite migrated from Jest imports it. Its files that
// mention `jest` then get one.
//
// What a support entry registers lasts as long as the entry's module does. Each test
// file gets a fresh module registry by default, and under the hot runtime, which evicts
// node_modules per file, so the entry runs again and registers again. Under
// `isolate: false` modules outlive the file, a cached entry never runs again, and its
// registrations stay with it, as the module's other state does.
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import vm from "node:vm";
import { createJestObject } from "../jest-compat/jest-object.mjs";
import { nodeRegistry } from "../jest-compat/node-registry.mjs";
import { nodeDispatch } from "../node-dispatch.mjs";
import { projectContext } from "../context.mjs";

const SUPPORT_LEAVES = new Set(["jestSetup", "mock"]);
const MENTIONS_JEST = /\bjest\b/;

/**
 * The worker's library-support state, on the dispatcher's "library-jest" channel: one per
 * worker however many instances of this file are evaluated (Node loads it for the require
 * hooks; the setup file may reach another instance, through Vite's runner under the hot
 * runtime), as node-dispatch.mjs keeps its own.
 */
const lib = nodeDispatch().channel("library-jest");
/** Packages whose test support has loaded in this worker. */
const active = (lib.active ??= new Set());
/** The support entries evaluated in this worker: `{ pkg, module }`. */
const entries = (lib.entries ??= new Set());
/** How many library-building scopes are open (support entries, their factories). */
lib.building ??= 0;
/** The support entries being evaluated, innermost last: `{ pkg, module }`. */
const owners = (lib.owners ??= []);
/** One `jest` per file. */
const jestByFile = (lib.jestByFile ??= new Map());
/** Each directory's package, by its nearest named package.json (workspace links too). */
const packageByFile = (lib.packageByFile ??= new Map());
const projectRoot = path.resolve(projectContext()?.projectRoot ?? process.cwd());

/**
 * The package `file` belongs to and its directory: the nearest package.json that names
 * a package (a `lib/commonjs/package.json` holding only `"type"` does not). By manifest
 * rather than by node_modules path, so a workspace or `file:` link, whose directory need
 * not carry the package's name, is found too. Cached per directory.
 */
function packageRootOf(file) {
  if (typeof file !== "string") return null;
  const start = path.dirname(file);
  if (packageByFile.has(start)) return packageByFile.get(start);
  let root = null;
  for (let dir = start; ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (fs.existsSync(manifest)) {
      let name;
      try {
        name = JSON.parse(fs.readFileSync(manifest, "utf8")).name;
      } catch {
        name = undefined;
      }
      if (typeof name === "string") {
        root = { name, dir, expoModule: fs.existsSync(path.join(dir, "expo-module.config.json")) };
        break;
      }
    }
    if (path.dirname(dir) === dir) break;
  }
  packageByFile.set(start, root);
  return root;
}

/** Whether `file` belongs to a package whose test support has loaded. */
export function isSupportFile(file) {
  const root = packageRootOf(file);
  return root !== null && active.has(root.name);
}

/**
 * The package `file` is a test-support entry of (its `jestSetup`, `mock`, or a file
 * under its `jest/`), or null: a support file loaded by `import` or a `setupFiles` entry
 * reaches the CommonJS loader without the request `Module._load` sees.
 */
function supportPackageOfFile(file) {
  const root = packageRootOf(file);
  if (root === null) return null;
  // The project's own `jest/setup.js` or `src/api/mock.ts` is not a library's support:
  // giving it a library's `jest` would make its mocks outlive a reset.
  if (root.dir === projectRoot || projectRoot.startsWith(root.dir + path.sep)) return null;
  const rest = path.relative(root.dir, file).split(path.sep).join("/");
  const leaf = path.posix.basename(rest).replace(/\.[cm]?[jt]sx?$/, "");
  const parts = rest.split("/");
  if (SUPPORT_LEAVES.has(leaf) || parts[0] === "jest") return root.name;
  // An Expo module's mock of its native module, `mocks/<NativeModule>`.
  if (root.expoModule && parts.length === 2 && parts[0] === "mocks") return root.name;
  return null;
}

/** Whether the support entry `owner` is still the module a `require` of it returns. */
function loaded(owner) {
  return owner !== null && Module._cache[owner.module.filename] === owner.module;
}

/**
 * Start a test file: of what libraries registered, only what a still-loaded support
 * entry made is kept (see the top of this file), and only those packages stay active.
 * The engine's own library setup files run after this, for every file (setup.mjs).
 */
export function beginTestFile() {
  active.clear();
  jestByFile.clear();
  // A support entry still loaded (`isolate: false` keeps modules) keeps its package's
  // support active, whether or not it registered a mock.
  for (const owner of entries) {
    if (loaded(owner)) active.add(owner.pkg);
    else entries.delete(owner);
  }
  globalThis.__vitest_native_jest_registry?.clear({
    keep(entry) {
      if (!entry.library || !loaded(entry.owner)) return false;
      active.add(entry.owner.pkg);
      return true;
    },
  });
}

const BASELINE_SETTERS = [
  ["mockImplementation", (impl) => impl],
  ["mockReturnValue", (value) => () => value],
  ["mockResolvedValue", (value) => () => Promise.resolve(value)],
  ["mockRejectedValue", (value) => () => Promise.reject(value)],
];

/** The `jest` a library file sees. */
export function libraryJestFor(vi, file) {
  let jest = jestByFile.get(file);
  if (jest) return jest;
  const registry = () => nodeRegistry();
  const base = createJestObject(vi);
  // `jest.fn` whose built implementation is the mock's own: a delegate Vitest keeps
  // through a reset, which calls whatever implementation the library installed.
  const fn = (impl) => {
    let own = impl;
    const mock = base.fn(function (...args) {
      return own === undefined ? undefined : own.apply(this, args);
    });
    for (const [name, toImpl] of BASELINE_SETTERS) {
      const set = mock[name];
      mock[name] = (value) => {
        if (lib.building === 0) return set.call(mock, value);
        own = toImpl(value);
        return mock;
      };
    }
    return mock;
  };
  // A factory the library registers runs later, when the module is first required;
  // what it builds is part of the library's mocks too, and belongs to the same entry.
  const asBuilding = (factory, owner) => () => {
    lib.building++;
    if (owner !== null) owners.push(owner);
    try {
      return factory();
    } finally {
      if (owner !== null) owners.pop();
      lib.building--;
    }
  };
  const mock = (spec, factory) => {
    const owner = owners.at(-1) ?? null;
    registry().register(file, spec, asBuilding(factory ?? (() => ({})), owner), undefined, {
      library: true,
      owner,
    });
    return jest;
  };
  jest = createJestObject(vi, {
    fn,
    mock,
    doMock: mock,
    unmock: (spec) => {
      registry().unregister(file, spec);
      return jest;
    },
    requireActual: (spec) => registry().require(spec, file, true),
    requireMock: (spec) => registry().require(spec, file, false),
  });
  jestByFile.set(file, jest);
  return jest;
}

/**
 * Install the pieces in the worker: a support file's code runs with its own `jest`, which
 * it reaches through the dispatcher's "library-jest" channel (no global of its own), and
 * its `@jest/globals` is that `jest` (the dispatcher's librarySupport step). Its code is
 * compiled by the engine's CommonJS handlers (native/hooks.mjs), which call
 * compileSupport/loadSupport. Once per worker.
 */
export function installLibraryJest(vi, globals = {}) {
  lib.vi = vi;
  lib.globals = globals;
  lib.libraryJestFor = (file) => libraryJestFor(lib.vi, file);
  // `@jest/globals` from a support file is that file's `jest`, with the test API beside it
  // (LOAD_STEPS). jest-runtime answers it before any mock, as this step's rank does.
  nodeDispatch().load.add(
    "librarySupport",
    (next) =>
      function (request, parent, ...rest) {
        if (request === "@jest/globals" && isSupportFile(parent?.filename)) {
          const jest = libraryJestFor(lib.vi, parent.filename);
          const api = { ...lib.globals, jest };
          return { ...api, __esModule: true, default: api };
        }
        return next(request, parent, ...rest);
      },
  );
}

/**
 * What library support needs of `filename`'s compile, or null (the common case, one
 * cached lookup): the package it is a support entry of, and whether its code may need a
 * `jest`.
 */
function supportOf(filename) {
  if (lib.vi === undefined) return null;
  const entryOf = supportPackageOfFile(filename);
  if (entryOf !== null) active.add(entryOf);
  const wantsJest = isSupportFile(filename);
  return entryOf === null && !wantsJest ? null : { entryOf, wantsJest };
}

/** `content` with a `jest` of the file's own, or null when it needs none or cannot have one. */
function withJest(content, filename, probe) {
  if (typeof content !== "string" || !MENTIONS_JEST.test(content)) return null;
  // On the first line, so line numbers stay. A parameter rather than a `var`, and the
  // code in a function of its own, so a file that declares its own `jest`
  // (`const { jest } = require("@jest/globals")`) still compiles and shadows it. Node's
  // module arguments pass through, for code that reads `arguments`.
  const wrapped =
    `(function (jest, args) {return (function () {${stripShebang(content)}\n}).apply(this, args);}).call(this, ` +
    `globalThis[Symbol.for("vitest-native.node-dispatch")].channel("library-jest").libraryJestFor(__filename), arguments);`;
  // An ES module's syntax cannot sit in a function body: a file read from disk is probed,
  // and left as it is when it is one. The engine's compiled output is CommonJS already.
  return !probe || parses(wrapped, filename) ? wrapped : null;
}

/** Run `compile` as the evaluation of `mod`, a support entry of `entryOf` when it is one. */
function asSupport(mod, entryOf, compile) {
  // A support entry, however it is reached (`require`, `import`, `setupFiles`), builds the
  // library's mocks, and owns what it registers.
  if (entryOf === null) return compile();
  const owner = { pkg: entryOf, module: mod };
  entries.add(owner);
  lib.building++;
  owners.push(owner);
  try {
    return compile();
  } finally {
    owners.pop();
    lib.building--;
  }
}

/** Compile `content` (already read or compiled by the engine) as `mod`. */
export function compileSupport(mod, content, filename) {
  const support = supportOf(filename);
  if (support === null) return mod._compile(content, filename);
  const wrapped = support.wantsJest ? withJest(content, filename, false) : null;
  return asSupport(mod, support.entryOf, () => mod._compile(wrapped ?? content, filename));
}

/**
 * Load `filename` as Node's own `.js` handler (`loadJs`) would. A support file Node loads
 * as CommonJS and whose code needs a `jest` is read and compiled with it here; anything
 * else, an ES module among them, is Node's.
 */
export function loadSupport(mod, filename, loadJs) {
  const support = supportOf(filename);
  if (support === null) return loadJs(mod, filename);
  let wrapped = null;
  if (support.wantsJest && !isModuleType(filename)) {
    wrapped = withJest(fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, ""), filename, true);
  }
  return asSupport(mod, support.entryOf, () =>
    wrapped !== null ? mod._compile(wrapped, filename) : loadJs(mod, filename),
  );
}

/** Whether Node loads `.js` in `filename`'s directory as an ES module (`"type": "module"`). */
function isModuleType(filename) {
  if (filename.endsWith(".cjs")) return false;
  if (filename.endsWith(".mjs")) return true;
  for (let dir = path.dirname(filename); ; dir = path.dirname(dir)) {
    if (moduleTypeByDir.has(dir)) return moduleTypeByDir.get(dir);
    const manifest = path.join(dir, "package.json");
    if (fs.existsSync(manifest)) {
      let type;
      try {
        type = JSON.parse(fs.readFileSync(manifest, "utf8")).type;
      } catch {
        type = undefined;
      }
      const isModule = type === "module";
      moduleTypeByDir.set(dir, isModule);
      return isModule;
    }
    if (path.dirname(dir) === dir) return false;
  }
}
const moduleTypeByDir = (lib.moduleTypeByDir ??= new Map());

/** Whether `code` parses as a script; it is not run. */
function parses(code, filename) {
  try {
    return new vm.Script(code, { filename }) instanceof vm.Script;
  } catch {
    return false;
  }
}

function stripShebang(code) {
  return code.startsWith("#!") ? code.replace(/^#!.*/, "") : code;
}
