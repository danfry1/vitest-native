// One module registry per test file, for the modules Node loads.
//
// Jest has ONE registry per test file, so `jest.mock(spec, factory)` applies to every
// load of the module: imports, `require()`, what `jest.requireActual` pulls in, and
// `jest.requireMock` — all through `Runtime.requireModuleOrMock` -> `requireMock`,
// which runs the factory once and caches it in `_mockRegistry` (jest-runtime 29.7,
// build/index.js). Under Vitest only imports see `vi.mock`; `require()` and what it
// loads go through Node's CommonJS loader. jestMockTransform registers each factory
// here, keyed by the resolved file, and a `Module._load` wrapper serves the same
// memoized value to Node. State lives on globalThis: the setup file can evaluate
// more than once per worker, and the hook must install once.
import Module, { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandAlias } from "./aliases.mjs";
import { resolvePlatformFile } from "../native/resolve.mjs";
import { resetEvaluatedModules, restoreEvaluatedModules } from "../native/module-reset.mjs";
import { VitestNativeError } from "../errors.mjs";

const STATE = "__vitest_native_jest_registry";
/** The manifest id under which the hot runtime clears the registry per file. */
export const NODE_MOCKS_STATE_ID = "jest-compat.node-mocks";

const NODE_MODULES = /[\\/]node_modules[\\/]/;
// Native addons cannot be unloaded and re-required (module-reset.mjs, UNRESETTABLE).
const UNRESETTABLE = /\.node$/;
// Source modules only are shared with Vite: it serves JSON and assets as `{ default }`
// modules, while Node's loader gives the parsed object or the asset stub itself.
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const NONE = Symbol("vitest-native.jest-registry.none");

function envList(name) {
  try {
    const value = JSON.parse(process.env[name] || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** Configuration the plugin hands the worker, shared with the compat setup. */
export const config = {
  projectRoot: process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd(),
  platform: process.env.VITEST_NATIVE_PLATFORM === "android" ? "android" : "ios",
  // The project's string-to-string `resolve.alias` entries (and tsconfig `paths` when
  // Vite resolves them), which Node knows nothing of.
  aliases: envList("VITEST_NATIVE_REQUIRE_ALIASES"),
  skippedAliases: envList("VITEST_NATIVE_REQUIRE_ALIASES_SKIPPED"),
};
const sourceExts = envList("VITEST_NATIVE_SOURCE_EXTS");

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

/** A parent for Node's resolver, as `createRequire(file)` builds one. */
function parentModuleFor(file) {
  const parent = new Module(file, null);
  parent.filename = file;
  parent.paths = Module._nodeModulePaths(path.dirname(file));
  return parent;
}

/** Vitest's worker state: the evaluated module graph and the running test file. */
const worker = () => globalThis.__vitest_worker__;

function createState() {
  const rootFile = path.join(config.projectRoot, "package.json");
  const rootParent = parentModuleFor(rootFile);
  const registryFile = process.env.VITEST_NATIVE_RN_REGISTRY;
  const realRegistryFile = registryFile ? canonical(registryFile) : null;
  const exts = sourceExts.length > 0 ? sourceExts : undefined;
  const platformFile = (base) => {
    const hit = resolvePlatformFile(base, config.platform, exts);
    return hit && canonical(hit);
  };

  const state = {
    /** Resolved file -> entry. */
    entries: new Map(),
    /** Specifiers no resolver could place (Jest's virtual mocks) -> entry. */
    unresolved: new Map(),
    /** `parentFile\0request` -> resolved file or null. Valid for the worker's life. */
    resolutions: new Map(),
    /** What `requireActual` is loading: its next load skips the mock. */
    bypass: null,
    /** The open isolateModules block, if any. */
    isolation: null,
    /** The test file the registrations belong to. */
    file: undefined,
    /** Module._cache keys present when the registry was installed: never reset. */
    baseline: new Set(Object.keys(Module._cache)),
  };

  // Resolve as the require hooks will, so registration and lookup share one key:
  // platform variants first for an extensionless path (Metro's order, as Vite and
  // Jest's RN preset do), then Node's resolver with the hooks' fallbacks, then the
  // aliases directly (the mock engine installs no hooks). Null when nothing resolves.
  function resolveUncached(request, parent) {
    const isPath = request.startsWith(".") || path.isAbsolute(request);
    if (isPath && !path.extname(request)) {
      const hit = platformFile(path.resolve(path.dirname(parent.filename), request));
      if (hit) return hit;
    }
    try {
      const resolved = Module._resolveFilename(request, parent, false);
      // The hooks' fallbacks return the path as found, not the real path.
      return Module.isBuiltin(resolved) ? null : canonical(resolved);
    } catch {
      // fall through
    }
    const expanded = isPath ? request : expandAlias(request, config.aliases);
    if (expanded === request) return null;
    if (path.isAbsolute(expanded) && !path.extname(expanded)) {
      const hit = platformFile(expanded);
      if (hit) return hit;
    }
    try {
      return canonical(Module._resolveFilename(expanded, rootParent, false));
    } catch {
      return null;
    }
  }

  /** Cached: resolution does not change within a worker, whatever is mocked. */
  state.resolve = (request, parent) => {
    if (typeof request !== "string" || Module.isBuiltin(request)) return null;
    parent ??= rootParent;
    const key = `${parent.filename}\0${request}`;
    let filename = state.resolutions.get(key);
    if (filename === undefined) {
      filename = resolveUncached(request, parent);
      state.resolutions.set(key, filename);
    }
    return filename;
  };

  /** Resolve `spec` as written in `from` (a file path or file URL). */
  state.resolveFrom = (spec, from) => {
    const file = typeof from === "string" && from.startsWith("file:") ? fileURLToPath(from) : from;
    return state.resolve(spec, file ? parentModuleFor(file) : rootParent);
  };

  // Registrations are per test file, as in Jest. The hot runtime clears them at the
  // file boundary; a worker reused without it (`isolate: false`) drops them here.
  function currentFile() {
    const file = worker()?.filepath;
    if (file !== state.file) {
      if (state.file !== undefined) state.clear();
      state.file = file;
    }
  }

  // The memoized mock: `requireMock` caches the factory's result in `_mockRegistry`.
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

  /** The entry a load of `request` (resolved to `filename`) is served, if any. */
  state.lookup = (filename, request) => {
    currentFile();
    if (state.bypass === (filename ?? `\0${request}`)) {
      // `requireActual`: this one load gets the real module; anything it requires
      // in turn is mocked as usual. A virtual mock has no real module, so Node's
      // loader reports it missing, as Jest does.
      state.bypass = null;
      return undefined;
    }
    return filename !== null ? state.entries.get(filename) : state.unresolved.get(request);
  };

  state.register = (from, spec, factory) => {
    currentFile();
    const filename = state.resolveFrom(spec, from);
    const entry = { spec, factory, has: false, value: undefined, evaluating: false };
    if (filename !== null) state.entries.set(filename, entry);
    else state.unresolved.set(spec, entry);
    // The hoisted `vi.mock` factory looks its entry up by where it was written.
    state.byCall.set(`${from}\0${spec}`, entry);
    return entry;
  };
  state.byCall = new Map();

  state.unregister = (from, spec) => {
    currentFile();
    const filename = state.resolveFrom(spec, from);
    if (filename !== null) state.entries.delete(filename);
    state.unresolved.delete(spec);
  };

  // `require` for requireActual/requireMock: relative from the caller, else from the
  // project root. Paths and aliases load by resolved file; a package by NAME, since
  // presets shadow packages by name (native/hooks.mjs). `actual` bypasses the mock.
  state.require = (spec, caller, actual = false) => {
    const isPath = spec.startsWith(".") || path.isAbsolute(spec);
    const anchor = isPath && caller ? caller : rootFile;
    const filename = state.resolveFrom(spec, anchor);
    if (actual) state.bypass = filename ?? `\0${spec}`;
    try {
      const load = createRequire(anchor);
      if (filename !== null && (isPath || expandAlias(spec, config.aliases) !== spec)) {
        return load(filename);
      }
      return load(spec);
    } catch (error) {
      if (error?.code === "MODULE_NOT_FOUND" && !isPath && config.skippedAliases.length > 0) {
        throw new VitestNativeError(
          "REQUIRE_ACTUAL_ALIAS_UNSUPPORTED",
          `jest.requireActual('${spec}') could not be resolved. The project defines ` +
            `resolve.alias entries that cannot be applied to requireActual — only ` +
            `string-to-string entries can be (skipped: ${config.skippedAliases.join(", ")}). ` +
            `Use a string \`find\` for this alias, or a relative path.`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      if (actual) state.bypass = null;
    }
  };

  // What a reset drops. Jest clears everything; node_modules (React Native's
  // singletons), native addons, the RN registry and pre-existing modules stay.
  state.isResettable = (id) =>
    !state.baseline.has(id) &&
    !NODE_MODULES.test(id) &&
    !UNRESETTABLE.test(id) &&
    id !== realRegistryFile;

  state.dropProjectModules = () => {
    const dropped = new Map();
    for (const id of Object.keys(Module._cache)) {
      if (!state.isResettable(id)) continue;
      dropped.set(id, Module._cache[id]);
      delete Module._cache[id];
    }
    return dropped;
  };

  const allEntries = () => [...state.entries.values(), ...state.unresolved.values()];
  const forget = (entry) => {
    entry.has = false;
    entry.value = undefined;
  };

  /**
   * `jest.resetModules()`. `Runtime.resetModules` (jest-runtime 29.7, index.js:1109)
   * clears the module registry and `_mockRegistry` — the factories' cached results —
   * but keeps `_mockFactories`, so the next load re-evaluates modules and re-runs
   * factories. It also nulls the isolated registries, ending an open isolateModules
   * block. Here: Vite's graph including the `mock:` nodes `vi.resetModules()` keeps (so
   * an import after the reset gets the same new mock a require does), the project
   * modules in Node's cache, and each memoized value. False when Vite's graph is not
   * reachable, for the caller to fall back to `vi.resetModules()`.
   */
  state.resetModules = () => {
    const map = worker()?.evaluatedModules?.idToModuleMap;
    if (map) resetEvaluatedModules(map);
    state.isolation = null;
    state.dropProjectModules();
    allEntries().forEach(forget);
    return Boolean(map);
  };

  /**
   * `jest.isolateModules(fn)` / `isolateModulesAsync(fn)` (index.js:1073-1108): `fn`
   * runs against a fresh module registry and a fresh `_isolatedMockRegistry`, both
   * discarded afterwards. `requireMock` (index.js:932-943) looks in the isolated mock
   * registry and then the OUTER one, so a mock created before the block is reused
   * inside it, and only a mock first created inside is fresh — and gone afterwards.
   * Returns the function that ends the block.
   */
  state.isolate = (name, other) => {
    if (state.isolation) {
      throw new VitestNativeError(
        "JEST_ISOLATE_NESTED",
        `${name} cannot be nested inside another ${name} or ${other}.`,
      );
    }
    const map = worker()?.evaluatedModules?.idToModuleMap;
    const isolation = {
      modules: state.dropProjectModules(),
      had: new Set(allEntries().filter((entry) => entry.has)),
      vite: map ? new Map() : null,
    };
    if (map) resetEvaluatedModules(map, isolation.vite);
    state.isolation = isolation;
    return () => {
      // `resetModules` inside the block ended it, as in Jest, where it nulls the
      // isolated registries and the block's `finally` finds nothing to clear.
      if (state.isolation !== isolation) return;
      state.isolation = null;
      state.dropProjectModules();
      for (const [id, mod] of isolation.modules) Module._cache[id] = mod;
      allEntries()
        .filter((entry) => !isolation.had.has(entry))
        .forEach(forget);
      if (map) restoreEvaluatedModules(map, isolation.vite);
    };
  };

  state.clear = () => {
    state.entries.clear();
    state.unresolved.clear();
    state.byCall.clear();
    state.bypass = null;
    state.isolation = null;
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
  if (typeof worker()?.evaluatedModules?.getModulesByFile !== "function") {
    console.warn(
      "[vitest-native] jest-compat cannot reach Vitest's module graph in this worker, so " +
        "require() may load a second copy of a module the test imported, and " +
        "jest.isolateModulesAsync() does not isolate import().",
    );
  }
  return state;
}

/**
 * Vite's instance of a project module this file already evaluated, for a CommonJS
 * consumer, or NONE — so `require('./store')` after `import './store'` is one module,
 * as under Jest's single registry. Read from Vitest's worker state (`getModulesByFile`
 * is Vite's `EvaluatedModules` API). Skipped: nodes mid-evaluation, `mock:` nodes
 * (this registry serves those), and CommonJS Vite evaluated, whose `module.exports`
 * is a plain `default` data property where an ES module's exports are all getters.
 * The facade adds `__esModule` for Babel's interop, and a write defines a value on
 * the shared exports object, as `require(x).FLAG = true` does under babel-jest.
 */
const viteFacades = new WeakMap();
function viteInstanceOf(filename) {
  if (!SOURCE_FILE.test(filename)) return NONE;
  const nodes = worker()?.evaluatedModules?.getModulesByFile?.(filename.replace(/\\/g, "/"));
  for (const node of nodes ?? []) {
    if (node.id?.startsWith("mock:") || !node.evaluated || node.exports == null) continue;
    const ns = node.exports;
    if ("value" in (Object.getOwnPropertyDescriptor(ns, "default") ?? {})) return NONE;
    let facade = viteFacades.get(ns);
    if (!facade) {
      facade = new Proxy(ns, {
        get: (target, key, receiver) =>
          key === "__esModule" && !Reflect.has(target, key)
            ? true
            : Reflect.get(target, key, receiver),
        has: (target, key) => key === "__esModule" || Reflect.has(target, key),
        set: (target, key, value) =>
          Reflect.defineProperty(target, key, {
            value,
            writable: true,
            enumerable: true,
            configurable: true,
          }),
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
    // A project file is what a test or a Node-loaded project module requires. Only
    // those requests can share Vite's instances; any request can hit a mock, but
    // only when there is one.
    const fromProject =
      typeof parent?.filename === "string" &&
      !NODE_MODULES.test(parent.filename) &&
      state.isResettable(parent.filename);
    if ((!fromProject && state.isEmpty()) || Module.isBuiltin(request)) {
      return origLoad.call(this, request, parent, ...rest);
    }
    const filename = state.resolve(request, parent);
    const entry = state.lookup(filename, request);
    if (entry !== undefined) return state.valueOf(entry);
    // A module Node already holds stays the one `require` returns: switching a later
    // require to Vite's copy would change its identity mid-file.
    if (
      fromProject &&
      filename !== null &&
      !state.isolation &&
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
    const entry = state.lookup(canonical(filename), filename);
    return entry === undefined ? NONE : state.valueOf(entry);
  }
  nodeMockForRegistry.NONE = NONE;
}
