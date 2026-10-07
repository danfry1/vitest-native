// One module registry per test file, for the modules Node loads.
//
// Jest has ONE module registry per test file (jest-runtime's `Runtime`), so a
// `jest.mock(spec, factory)` applies to every load of that module in the file: an
// import, a synchronous `require()`, a module that `jest.requireActual(other)` pulls
// in, and `jest.requireMock(spec)`. Every one of those goes through
// `Runtime.requireModuleOrMock` -> `_shouldMockCjs` -> `requireMock`, which calls the
// factory once and caches the result in `_mockRegistry` (jest-runtime 29.7,
// build/index.js, `requireMock`).
//
// Under Vitest, imports go through Vite's module runner, where `vi.mock` applies. A
// `require()` from a test, `jest.requireActual`, and everything those load
// transitively go through Node's CommonJS loader instead, where no mock applied. This
// module bridges the two:
//
//   - jestMockTransform registers each `jest.mock`/`jest.doMock` factory here at the
//     call's (hoisted) position, keyed by the RESOLVED file, and hands Vitest a factory
//     that returns the same memoized value. One mock instance serves both graphs.
//   - A `Module._load` wrapper serves registered mocks to Node's loader.
//   - `requireActual` bypasses the mock for the requested module only, as
//     `Runtime.requireActual` does (`requireModule(from, name, undefined, true)`): the
//     modules it loads still see the file's mocks.
//   - `resetModules` and `isolateModules(Async)` give fresh project modules, with the
//     factories kept, as `Runtime.resetModules` / `Runtime.isolateModules` do.
//
// All state lives on globalThis: the setup file that installs this can evaluate more
// than once in a worker (once per test file under the hot runtime), and the loader
// hook must be installed exactly once.
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandAlias } from "./aliases.mjs";
import { resolvePlatformFile } from "../native/resolve.mjs";
import { VitestNativeError } from "../errors.mjs";

const STATE = "__vitest_native_jest_registry";
/** The manifest id under which the hot runtime clears the registry per file. */
export const NODE_MOCKS_STATE_ID = "jest-compat.node-mocks";

const NODE_MODULES = /[\\/]node_modules[\\/]/;
// Native addons cannot be unloaded and re-required (module-reset.mjs, UNRESETTABLE).
const UNRESETTABLE = /\.node$/;
const NONE = Symbol("vitest-native.jest-registry.none");

function envList(name) {
  try {
    const value = JSON.parse(process.env[name] || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function sourceExtensions() {
  const exts = envList("VITEST_NATIVE_SOURCE_EXTS");
  return exts.length > 0 ? exts : undefined;
}

const realpathCache = new Map();
/** Node keys its cache by real path; a platform-variant scan does not resolve links. */
function canonical(file) {
  let real = realpathCache.get(file);
  if (real === undefined) {
    try {
      real = fs.realpathSync(file);
    } catch {
      real = file;
    }
    realpathCache.set(file, real);
  }
  return real;
}

function asFile(from) {
  if (typeof from !== "string") return null;
  return from.startsWith("file://") ? fileURLToPath(from) : from;
}

/** A parent for Node's resolver, as `createRequire(file)` builds one. */
function parentModuleFor(file) {
  const parent = new Module(file, null);
  parent.filename = file;
  parent.paths = Module._nodeModulePaths(path.dirname(file));
  return parent;
}

function createState() {
  const projectRoot = process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
  const rootParent = parentModuleFor(path.join(projectRoot, "package.json"));
  const platform = process.env.VITEST_NATIVE_PLATFORM === "android" ? "android" : "ios";
  const sourceExts = sourceExtensions();
  const aliases = envList("VITEST_NATIVE_REQUIRE_ALIASES");
  const registryFile = process.env.VITEST_NATIVE_RN_REGISTRY || null;

  const state = {
    /** Resolved file -> entry. */
    entries: new Map(),
    /** Specifiers no resolver could place (Jest's virtual mocks) -> entry. */
    unresolved: new Map(),
    /** `parentFile\0request` -> resolved file or null, for the loader hook. */
    resolutions: new Map(),
    /** The file `requireActual` is loading right now; its next load skips the mock. */
    bypass: null,
    /** Set while `isolateModules(Async)` runs. */
    isolated: false,
    /** Module._cache keys present when the registry was installed: never reset. */
    baseline: new Set(Object.keys(Module._cache)),
    platform,
  };

  /**
   * Resolve `request` from `parent` (a Module, or a file path) the way the require
   * hooks will when Node loads it, so registration and lookup agree on one key.
   *
   * An extensionless relative or absolute path tries the platform variants first, in
   * Metro's order, as Vite's resolver and Jest's React Native preset (`defaultPlatform`
   * + `platforms`) both do; Node's own extension list would pick `x.ts` over
   * `x.ios.ts`. Then Node's resolver, which carries the hooks' alias, platform and
   * deep-import fallbacks under the native engine; then the aliases directly, for the
   * mock engine, which installs no hooks. Null when nothing resolves.
   */
  function resolve(request, parent) {
    if (typeof request !== "string" || Module.isBuiltin(request)) return null;
    const parentFile = parent?.filename ?? null;
    const isPath = request.startsWith(".") || path.isAbsolute(request);
    if (isPath && !path.extname(request)) {
      const base = parentFile ? path.resolve(path.dirname(parentFile), request) : request;
      if (path.isAbsolute(base)) {
        const hit = resolvePlatformFile(base, platform, sourceExts);
        if (hit) return canonical(hit);
      }
    }
    try {
      const resolved = Module._resolveFilename(request, parent ?? rootParent, false);
      // The hooks' fallbacks (aliases, deep React Native paths) return the path as
      // found, not the real path Node's own resolution returns.
      return Module.isBuiltin(resolved) ? null : canonical(resolved);
    } catch {
      // fall through
    }
    if (!isPath && aliases.length > 0) {
      const expanded = expandAlias(request, aliases);
      if (expanded !== request) {
        if (path.isAbsolute(expanded) && !path.extname(expanded)) {
          const hit = resolvePlatformFile(expanded, platform, sourceExts);
          if (hit) return canonical(hit);
        }
        try {
          return canonical(Module._resolveFilename(expanded, rootParent, false));
        } catch {
          // fall through
        }
      }
    }
    return null;
  }
  state.resolve = resolve;

  /** Resolve `spec` as written in `fromFile` (a test or setup file). */
  state.resolveFrom = (spec, fromFile) => {
    const file = asFile(fromFile);
    return resolve(spec, file ? parentModuleFor(file) : rootParent);
  };

  /**
   * The memoized mock for an entry. `requireMock` caches the factory's result in
   * `_mockRegistry` the first time and returns the cached value afterwards; the cache
   * is what `resetModules` clears, while `_mockFactories` survives it.
   */
  state.valueOf = (entry) => {
    if (entry.has) return entry.value;
    if (entry.evaluating) {
      // Jest would re-enter the factory here until the stack overflowed.
      throw new VitestNativeError(
        "JEST_MOCK_FACTORY_CYCLE",
        `the jest.mock factory for '${entry.spec}' requires the module it mocks. ` +
          "Use jest.requireActual() inside the factory for the real module.",
      );
    }
    entry.evaluating = true;
    try {
      entry.value = entry.factory();
      entry.has = true;
    } finally {
      entry.evaluating = false;
    }
    return entry.value;
  };

  state.register = (fromFile, spec, factory) => {
    const filename = state.resolveFrom(spec, fromFile);
    const entry = { spec, filename, factory, has: false, value: undefined, evaluating: false };
    if (filename !== null) {
      state.entries.set(filename, entry);
    } else {
      state.unresolved.set(spec, entry);
    }
    state.resolutions.clear();
    return entry;
  };

  state.unregister = (fromFile, spec) => {
    const filename = state.resolveFrom(spec, fromFile);
    if (filename !== null) state.entries.delete(filename);
    state.unresolved.delete(spec);
    state.resolutions.clear();
  };

  /**
   * Project modules in Node's cache that a reset drops. Jest clears its whole module
   * registry (`_moduleRegistry.clear()`); here React Native and every other
   * node_modules package stay resident — re-evaluating them would hand the test a
   * second copy of their singletons — as do native addons, the precompiled React
   * Native registry, and whatever was loaded before this file's registry existed.
   */
  state.isResettable = (id) =>
    !state.baseline.has(id) &&
    !NODE_MODULES.test(id) &&
    !UNRESETTABLE.test(id) &&
    id !== registryFile &&
    !(registryFile !== null && id === canonical(registryFile));

  state.dropProjectModules = () => {
    const dropped = new Map();
    for (const id of Object.keys(Module._cache)) {
      if (!state.isResettable(id)) continue;
      dropped.set(id, Module._cache[id]);
      delete Module._cache[id];
    }
    state.resolutions.clear();
    return dropped;
  };

  state.clear = () => {
    state.entries.clear();
    state.unresolved.clear();
    state.resolutions.clear();
    state.bypass = null;
    state.isolated = false;
  };

  state.isEmpty = () => state.entries.size === 0 && state.unresolved.size === 0;

  return state;
}

/** The worker's registry, creating it and installing the loader hook on first use. */
export function nodeRegistry() {
  let state = globalThis[STATE];
  if (state) return state;
  state = createState();
  Object.defineProperty(globalThis, STATE, { value: state, configurable: true, writable: true });
  installLoadHook(state);
  return state;
}

/**
 * Vite's instance of a project module this file has already evaluated, shaped for a
 * CommonJS consumer, or NONE.
 *
 * Without this, a test that imports `./store` and then `require`s a module that also
 * reads `./store` gets two copies: Vite's, which the test configured, and a fresh one
 * Node loads, which nobody did. Jest has one registry, so it never has two. Vite's
 * graph is reachable through Vitest's worker state (`evaluatedModules`, whose
 * `getModulesByFile` is Vite's public `EvaluatedModules` API); when it is not, Node
 * loads the file as before.
 *
 * Only an evaluated, unmocked node is used: a node mid-evaluation has incomplete
 * exports, and Vitest's mocked modules are served by this registry instead. The ES
 * namespace gets `__esModule`, which Babel's CommonJS output checks before reading
 * `.default`, so `import x from` in a Node-loaded module sees the default export.
 */
const viteFacades = new WeakMap();
// Source modules only. Vite serves JSON and assets as `{ default, … }` modules, while
// Node's loader gives the parsed object or the asset stub (native/hooks.mjs) itself.
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
function viteInstanceOf(filename) {
  if (!SOURCE_FILE.test(filename)) return NONE;
  const modules = globalThis.__vitest_worker__?.evaluatedModules;
  if (typeof modules?.getModulesByFile !== "function") return NONE;
  const nodes = modules.getModulesByFile(filename.replace(/\\/g, "/"));
  if (!nodes) return NONE;
  for (const node of nodes) {
    if (typeof node.id === "string" && node.id.startsWith("mock:")) continue;
    if (!node.evaluated || node.exports == null) continue;
    let facade = viteFacades.get(node.exports);
    if (!facade) {
      const ns = node.exports;
      facade = new Proxy(ns, {
        get: (target, key, receiver) =>
          key === "__esModule" && !Reflect.has(target, key)
            ? true
            : Reflect.get(target, key, receiver),
        has: (target, key) => key === "__esModule" || Reflect.has(target, key),
      });
      viteFacades.set(ns, facade);
    }
    return facade;
  }
  return NONE;
}

function installLoadHook(state) {
  const origLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    // A project file is what a test or a Node-loaded project module requires; a
    // request from a package can still hit a mock, but only when there is one.
    const fromProject =
      parent != null &&
      typeof parent.filename === "string" &&
      !NODE_MODULES.test(parent.filename) &&
      state.isResettable(parent.filename);
    if ((state.isEmpty() && !fromProject) || Module.isBuiltin(request)) {
      return origLoad.call(this, request, parent, ...rest);
    }
    const key = `${parent?.filename ?? ""}\0${request}`;
    let filename = state.resolutions.get(key);
    if (filename === undefined) {
      filename = state.resolve(request, parent);
      state.resolutions.set(key, filename);
    }
    if (filename !== null && state.bypass === filename) {
      // `requireActual`: this one load gets the real module; anything it requires
      // in turn is mocked as usual.
      state.bypass = null;
    } else if (!state.isEmpty()) {
      const entry = filename !== null ? state.entries.get(filename) : state.unresolved.get(request);
      if (entry !== undefined) return state.valueOf(entry);
    }
    // A module Node already holds stays the one `require` returns: switching a later
    // require to Vite's copy would change its identity mid-file.
    if (
      filename !== null &&
      !state.isolated &&
      !NODE_MODULES.test(filename) &&
      Module._cache[filename] === undefined
    ) {
      const shared = viteInstanceOf(filename);
      if (shared !== NONE) return shared;
    }
    return origLoad.call(this, request, parent, ...rest);
  };

  // The precompiled React Native registry requires its own modules by id, past
  // Module._load (see registry.mjs). Jest serves `jest.mock('react-native/Libraries/
  // AppState/AppState', …)` to React Native's own `require('./Libraries/AppState/
  // AppState')`, so the registry asks here first. Undefined unless a mock exists.
  Object.defineProperty(globalThis, "__vitest_native_node_mock_for", {
    configurable: true,
    get: () => (state.entries.size === 0 ? undefined : nodeMockForRegistry),
  });
  function nodeMockForRegistry(filename) {
    const entry = state.entries.get(canonical(filename));
    return entry === undefined ? NONE : state.valueOf(entry);
  }
  nodeMockForRegistry.NONE = NONE;
}

/**
 * Snapshot and reset the state of Vite's evaluated modules, the way Vitest's own
 * `resetModules(modules, resetMocks)` does (vitest/dist/chunks/utils: it clears
 * `promise`, `exports`, `evaluated` and `importers`, skipping Vitest's own runtime).
 * `vi.resetModules()` keeps `mock:` nodes, so a mocked module imported after a reset
 * would still be the old factory result while Node's next require ran the factory
 * again; including them keeps one instance. Returns a restore function, or null when
 * Vitest's worker state is not reachable.
 */
const VITEST_RUNTIME = [/\/vitest\/dist\//, /vitest-virtual-\w+\/dist/, /@vitest\/dist/];
export function resetViteModules({ snapshot = false } = {}) {
  const map = globalThis.__vitest_worker__?.evaluatedModules?.idToModuleMap;
  if (!(map instanceof Map)) return null;
  const saved = snapshot ? new Map() : null;
  for (const [id, node] of map) {
    if (VITEST_RUNTIME.some((re) => re.test(id))) continue;
    if (saved) {
      saved.set(node, {
        promise: node.promise,
        exports: node.exports,
        evaluated: node.evaluated,
        importers: new Set(node.importers),
      });
    }
    node.promise = undefined;
    node.exports = undefined;
    node.evaluated = false;
    node.importers.clear();
  }
  if (!saved) return null;
  return () => {
    for (const [, node] of map) {
      const before = saved.get(node);
      if (before) {
        node.promise = before.promise;
        node.exports = before.exports;
        node.evaluated = before.evaluated;
        node.importers.clear();
        for (const importer of before.importers) node.importers.add(importer);
      } else if (!VITEST_RUNTIME.some((re) => re.test(node.id ?? ""))) {
        // First evaluated inside the isolated block: not visible outside it.
        node.promise = undefined;
        node.exports = undefined;
        node.evaluated = false;
        node.importers.clear();
      }
    }
  };
}

/**
 * Run `load` (a require of the module `filename` resolves to) with that one load
 * unmocked: the loader hook skips the mock for the first request resolving to
 * `filename`, so the module's own requires still see every mock.
 */
export function requireActualFile(state, filename, load) {
  const previous = state.bypass;
  state.bypass = filename;
  try {
    return load();
  } finally {
    state.bypass = previous;
  }
}
