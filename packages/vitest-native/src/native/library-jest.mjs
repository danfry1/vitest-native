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
// whose leaf is `jestSetup` or `mock`, or a file under its `jest/` directory, whether a
// preset loads it or a suite migrated from Jest imports it. Its files that mention
// `jest` then get one.
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
import { packageNameOf, subpathLeafOf } from "./match.mjs";

const SUPPORT_LEAVES = new Set(["jestSetup", "mock"]);
const MENTIONS_JEST = /\bjest\b/;

/** Packages whose test support has loaded in this worker. */
const active = new Set();
/** How many library-building scopes are open (support entries, their factories). */
let building = 0;
/** The support entries being evaluated, innermost last: `{ pkg, module }`. */
const owners = [];
/** One `jest` per file. */
const jestByFile = new Map();
/** Each directory's package, by its nearest named package.json (workspace links too). */
const packageByFile = new Map();
const projectRoot = path.resolve(process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd());

/**
 * The package `request` loads test support of, or null: a request whose last segment
 * is `jestSetup` or `mock`, or one into the package's `jest/` directory.
 */
export function supportPackageOf(request) {
  if (typeof request !== "string" || request.startsWith(".") || path.isAbsolute(request)) {
    return null;
  }
  const pkg = packageNameOf(request);
  if (pkg === request) return null;
  const subpath = request.slice(pkg.length + 1);
  const leaf = subpathLeafOf(request);
  return (leaf !== null && SUPPORT_LEAVES.has(leaf)) || subpath.split("/")[0] === "jest"
    ? pkg
    : null;
}

/** Run `load` as the evaluation of `pkg`'s test support. */
export function withinSupport(pkg, load) {
  active.add(pkg);
  building++;
  try {
    return load();
  } finally {
    building--;
  }
}

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
        root = { name, dir };
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
  return SUPPORT_LEAVES.has(leaf) || rest.split("/")[0] === "jest" ? root.name : null;
}

/** Whether the support entry `owner` is still the module a `require` of it returns. */
function loaded(owner) {
  return owner !== null && Module._cache[owner.module.filename] === owner.module;
}

/**
 * Start a test file: of what libraries registered, only what a still-loaded support
 * entry made is kept (see the top of this file), and only those packages stay active.
 */
export function beginTestFile() {
  active.clear();
  jestByFile.clear();
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
        if (building === 0) return set.call(mock, value);
        own = toImpl(value);
        return mock;
      };
    }
    return mock;
  };
  // A factory the library registers runs later, when the module is first required;
  // what it builds is part of the library's mocks too, and belongs to the same entry.
  const asBuilding = (factory, owner) => () => {
    building++;
    if (owner !== null) owners.push(owner);
    try {
      return factory();
    } finally {
      if (owner !== null) owners.pop();
      building--;
    }
  };
  const mock = (spec, factory) => {
    const owner = owners.at(-1) ?? null;
    registry().register(file, spec, asBuilding(factory ?? (() => ({})), owner), {
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
 * Install the pieces in the worker: a support file's compiled code runs with its own
 * `jest`, and its `@jest/globals` is that `jest`. Once per worker.
 */
export function installLibraryJest(vi) {
  if (globalThis.__vitest_native_library_jest) return;
  Object.defineProperty(globalThis, "__vitest_native_library_jest", {
    configurable: true,
    value: (file) => libraryJestFor(vi, file),
  });
  const compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename, ...rest) {
    const entryOf = supportPackageOfFile(filename);
    if (entryOf !== null) active.add(entryOf);
    if (
      typeof content === "string" &&
      isSupportFile(filename) &&
      MENTIONS_JEST.test(content) &&
      rest[0] !== "module"
    ) {
      // On the first line, so line numbers stay. A parameter rather than a `var`, and
      // the code in a function of its own, so a file that declares its own `jest`
      // (`const { jest } = require("@jest/globals")`) still compiles and shadows it.
      const wrapped =
        `(function (jest) {return (function () {${stripShebang(content)}\n}).call(this);}).call(this, ` +
        `globalThis.__vitest_native_library_jest(__filename));`;
      // An ES module's syntax cannot sit in a function body: such a file is left as it
      // is, for Node to load as a module.
      if (parses(wrapped, filename)) content = wrapped;
    }
    // A support entry reached by `import` or `setupFiles` builds the library's mocks
    // as one reached by `require` does (withinSupport), and owns what it registers.
    if (entryOf === null) return compile.call(this, content, filename, ...rest);
    building++;
    owners.push({ pkg: entryOf, module: this });
    try {
      return compile.call(this, content, filename, ...rest);
    } finally {
      owners.pop();
      building--;
    }
  };
  const load = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (request === "@jest/globals" && isSupportFile(parent?.filename)) {
      const jest = libraryJestFor(vi, parent.filename);
      return { jest, expect: globalThis.expect, __esModule: true, default: { jest } };
    }
    const pkg = supportPackageOf(request);
    if (pkg !== null) return withinSupport(pkg, () => load.call(this, request, parent, ...rest));
    return load.call(this, request, parent, ...rest);
  };
}

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
