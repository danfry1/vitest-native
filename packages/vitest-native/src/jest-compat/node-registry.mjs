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
import { expandResolutionAlias } from "../native/shared-resolver.mjs";
import {
  isWholePackageRequest,
  resolvePackageMainField,
  platformSubpathFile,
  resolvePlatformFile,
  resolveRelativePlatformFile,
} from "../native/resolve.mjs";
import { resetEvaluatedModules, restoreEvaluatedModules } from "../native/module-reset.mjs";
import { VitestNativeError } from "../errors.mjs";
import { activeRegistry, projectContext } from "../context.mjs";
import { nodeDispatch } from "../node-dispatch.mjs";
import { jestMockInterop } from "./interop.mjs";
import { owningPackageOfFile, packageNameOf } from "../native/match.mjs";

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
// `requireActual`'s one load: the real module, past every mock (lookup).
const BYPASSED = Symbol("vitest-native.jest-registry.bypassed");

const context = projectContext();
// The ownership guard's channel on the engine's dispatcher (native/ownership-ledger.mjs).
const ownershipChannel = nodeDispatch().channel("ownership");

/** Configuration the plugin hands the worker, shared with the compat setup. */
// Under experimental.ownershipModel the project's aliases have one record, the shared
// resolver's (every string and RegExp alias, and tsconfig `paths`, in Vite's order), and
// the plugin writes no second one.
const resolverAliases =
  context?.ownershipModel === "resolver" || context?.ownershipModel === "resolution"
    ? (context.resolverInputs?.aliases ?? [])
    : null;
const requireAliases = context?.requireAliases ?? [];

export const config = {
  projectRoot: context?.projectRoot ?? process.cwd(),
  platform: context?.platform === "android" ? "android" : "ios",
  /** `specifier` with the project's alias applied, which Node knows nothing of. */
  expandAlias:
    resolverAliases === null
      ? // The string-to-string `resolve.alias` entries (and tsconfig `paths` when Vite
        // resolves them).
        (specifier) => expandAlias(specifier, requireAliases)
      : (specifier) => expandResolutionAlias(specifier, resolverAliases),
  // Under the flag none: an alias Node cannot apply is refused when the plugin loads.
  skippedAliases: context?.requireAliasesSkipped ?? [],
};
const sourceExts = context?.sourceExts ?? [];

const realpathCache = new Map();
/** Node keys its cache by real path; a platform-variant scan does not resolve links. */
function canonical(file) {
  let real = realpathCache.get(file);
  if (real === undefined) {
    try {
      // Node's spelling (fs.realpathSync): the key Module._cache holds the file under.
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

/**
 * The directory of the package `file` is in, by the same rule as `owningPackageOfFile`
 * (the one after its last `node_modules/`), with forward slashes. Null outside
 * node_modules.
 */
function installedPackageDirOf(file) {
  const norm = file.replace(/\\/g, "/");
  const pkg = owningPackageOfFile(norm);
  if (pkg === null) return null;
  const at = norm.lastIndexOf("/node_modules/") + "/node_modules/".length;
  return norm.slice(0, at + pkg.length);
}

/** A Map that reports each change, so what is derived from its contents can be rebuilt. */
class WatchedMap extends Map {
  constructor(onChange) {
    super();
    this.onChange = onChange;
  }
  set(key, value) {
    super.set(key, value);
    this.onChange();
    return this;
  }
  delete(key) {
    const had = super.delete(key);
    if (had) this.onChange();
    return had;
  }
  clear() {
    super.clear();
    this.onChange();
  }
}

function createState() {
  const rootFile = path.join(config.projectRoot, "package.json");
  const rootParent = parentModuleFor(rootFile);
  const registryFile = activeRegistry(context);
  const realRegistryFile = registryFile ? canonical(registryFile) : null;
  const exts = sourceExts.length > 0 ? sourceExts : undefined;
  const platformFile = (base) => {
    const hit = resolvePlatformFile(base, config.platform, exts);
    return hit && canonical(hit);
  };
  const relativePlatformFile = (request, from) => {
    const hit = resolveRelativePlatformFile(request, from, config.platform, exts);
    return hit && canonical(hit);
  };

  let reach = null;
  const changed = () => {
    reach = null;
  };

  const state = {
    /** Resolved file -> entry. */
    entries: new WatchedMap(changed),
    /** Specifiers no resolver could place (Jest's virtual mocks) -> entry. */
    unresolved: new WatchedMap(changed),
    /** `parentFile\0request` -> resolved file or null. Valid for the worker's life. */
    resolutions: new Map(),
    /** What `requireActual` is loading: its next load skips the mock. */
    bypass: null,
    /** The open isolateModules block, if any. */
    isolation: null,
    /**
     * Module._cache keys a reset never drops. Taken when the registry is created, then
     * once more where the native setup installs the sharing (`shareProjectModules`), so a
     * library's Jest setup or a preset that creates the registry earlier cannot shrink it.
     */
    baseline: new Set(Object.keys(Module._cache)),
    baselineFixed: false,
    /** Platform files a React Native subpath resolved to (subpathPlatformFile). */
    platformSubpaths: new Set(),
  };

  // Resolve as the require hooks will, so registration and lookup share one key:
  // platform variants first for an extensionless path (Metro's order, as Vite and
  // Jest's RN preset do), then Node's resolver with the hooks' fallbacks, then the
  // aliases directly (the mock engine installs no hooks). Null when nothing resolves.
  function resolveUncached(request, parent) {
    const isPath = request.startsWith(".") || path.isAbsolute(request);
    if (isPath && !path.extname(request)) {
      const hit = relativePlatformFile(request, parent.filename);
      if (hit) return hit;
    }
    try {
      const resolved = Module._resolveFilename(request, parent, false);
      if (Module.isBuiltin(resolved)) return null;
      // The hooks' fallbacks return the path as found, not the real path.
      return subpathPlatformFile(request, resolved) ?? canonical(resolved);
    } catch {
      // fall through
    }
    const expanded = isPath ? request : config.expandAlias(request);
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

  // A React Native subpath lands on its platform file (#573). Recorded, so
  // requireActual loads that file itself (state.require): by the subpath, Node would
  // load the shim the package's `exports` map names, whose require of the platform
  // file would come back to the mock.
  const subpathPlatformFile = (request, resolved) => {
    if (!request.startsWith("react-native/")) return null;
    const hit = platformSubpathFile(request, resolved, config.platform, exts);
    if (!hit) return null;
    const file = canonical(hit);
    state.platformSubpaths.add(file);
    return file;
  };

  /**
   * How often the load hook asked `state.resolve`, how often that resolved afresh rather
   * than from its cache, and how often a request went to Node without either.
   */
  state.stats = { resolves: 0, uncached: 0, toNode: 0 };

  /** Cached: resolution does not change within a worker, whatever is mocked. */
  state.resolve = (request, parent) => {
    if (typeof request !== "string" || Module.isBuiltin(request)) return null;
    state.stats.resolves++;
    parent ??= rootParent;
    const key = `${parent.filename}\0${request}`;
    let filename = state.resolutions.get(key);
    if (filename === undefined) {
      state.stats.uncached++;
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

  // The memoized mock: `requireMock` caches the factory's result in `_mockRegistry`.
  //
  // A factory jestMockTransform made async (its `jest.requireActual` of project source
  // now loads through Vite: see transform.ts) yields a promise, as does one the author
  // wrote async. What is memoized is the SETTLED value, so every load gets the same
  // object, never the promise: Vite's import awaits it (`valueForImport`), and Vite
  // runs the factory while it evaluates the test file's imports, so a `require()` or
  // `jest.requireMock` in the test body finds it settled. A Node-side load that comes
  // first runs the synchronous original instead, which is what it did before the
  // rewrite, and Vite's import then gets that value. One that comes while the promise
  // is pending — Node requiring the module from inside its own factory's import graph,
  // a cycle — cannot wait, so it throws, as the synchronous cycle does.
  const settle = (entry, factory) => {
    entry.evaluating = true;
    let result;
    try {
      result = factory();
    } finally {
      entry.evaluating = false;
    }
    // By tag, not by a `then` method: see jestMockInterop in interop.mjs.
    if (Object.prototype.toString.call(result) !== "[object Promise]") {
      entry.value = result;
      entry.has = true;
      return result;
    }
    const pending = result.then(
      (value) => {
        if (entry.pending === pending) {
          entry.pending = null;
          entry.value = value;
          entry.has = true;
        }
        return value;
      },
      (error) => {
        if (entry.pending === pending) entry.pending = null;
        throw error;
      },
    );
    entry.pending = pending;
    return pending;
  };
  const cycle = (entry) =>
    // Jest would re-enter the factory here until the stack overflowed.
    new VitestNativeError(
      "JEST_MOCK_FACTORY_CYCLE",
      `the jest.mock factory for '${entry.spec}' requires the module it mocks. ` +
        "Use jest.requireActual() inside the factory for the real module.",
    );

  /** The mock for a Node-side load, which cannot wait for a promise. */
  state.valueOf = (entry) => {
    if (entry.has) return entry.value;
    if (entry.evaluating) throw cycle(entry);
    if (entry.pending) {
      // An author's own async factory has always handed Node its promise.
      if (!entry.asyncFactory) return entry.pending;
      throw new VitestNativeError(
        "JEST_MOCK_FACTORY_CYCLE",
        `'${entry.spec}' was required while its jest.mock factory was still loading the ` +
          "real module, which require() cannot wait for. Something that factory loads " +
          "requires the mocked module back; break the cycle, or import the module instead.",
      );
    }
    // An async factory the author wrote has no synchronous original, so this load gets
    // its promise, as it always has; later loads get the settled value.
    return settle(entry, entry.factory);
  };

  /** The mock for Vite's import: the settled value, or a promise of it. */
  state.valueForImport = (entry) => {
    if (entry.has) return entry.value;
    if (entry.pending) return entry.pending;
    if (entry.evaluating) throw cycle(entry);
    return settle(entry, entry.asyncFactory ?? entry.factory);
  };

  /** The entry a load of `request` (resolved to `filename`) is served, if any. */
  state.lookup = (filename, request) => {
    if (state.bypass === (filename ?? `\0${request}`)) {
      // `requireActual`: this one load gets the real module; anything it requires
      // in turn is mocked as usual. A virtual mock has no real module, so Node's
      // loader reports it missing, as Jest does.
      state.bypass = null;
      return BYPASSED;
    }
    return filename !== null ? state.entries.get(filename) : state.unresolved.get(request);
  };

  // `asyncFactory` is jestMockTransform's async variant of `factory`, when it made one.
  // `library`: registered by a library's own test support (native/library-jest.mjs),
  // whose lifetime the native setup decides at each file boundary; `owner` is what it
  // keeps it by.
  state.register = (from, spec, factory, asyncFactory, { library = false, owner = null } = {}) => {
    const filename = state.resolveFrom(spec, from);
    const entry = {
      spec,
      factory,
      asyncFactory,
      has: false,
      value: undefined,
      pending: null,
      evaluating: false,
      library,
      owner,
    };
    if (filename !== null) {
      state.entries.set(filename, entry);
      state.decided.add(canonical(filename));
    } else state.unresolved.set(spec, entry);
    // The hoisted `vi.mock` factory looks its entry up by where it was written.
    state.byCall.set(`${from}\0${spec}`, entry);
    return entry;
  };
  state.byCall = new Map();
  /**
   * The files a jest.* call registered or unregistered in this test file. Jest-compat
   * applies each to Node's require at once, and also queues it with Vitest for the
   * test's next import; that queued vi.doMock/vi.doUnmock is jest-compat's own, already
   * applied here, so it is no pending mock for Node (assertNoPendingMockOf).
   */
  state.decided = new Set();

  state.unregister = (from, spec) => {
    const filename = state.resolveFrom(spec, from);
    if (filename !== null) {
      state.entries.delete(filename);
      state.decided.add(canonical(filename));
    }
    state.unresolved.delete(spec);
  };

  // `require` for requireActual/requireMock: relative from the caller, else from the
  // project root. Paths and aliases load by resolved file; a package by NAME, since
  // presets shadow packages by name (native/hooks.mjs). `actual` bypasses the mock.
  state.require = (spec, caller, actual = false) => {
    const isPath = spec.startsWith(".") || path.isAbsolute(spec);
    const anchor = isPath && caller ? caller : rootFile;
    const filename = state.resolveFrom(spec, anchor);
    if (actual) {
      state.bypass = filename ?? `\0${spec}`;
      // A preset shadows its package by name (native/hooks.mjs); the actual module is
      // the package, as Jest's requireActual gives it, so this one load skips it too.
      if (!isPath) state.presetActual = spec;
    }
    // Tells the ownership guard that what Node compiles now is a jest-compat load, so
    // a dual evaluation it causes is reported with the jest-compat route and fix
    // (native/ownership-ledger.mjs) without a stack captured per compile.
    ownershipChannel.jestRequireDepth = (ownershipChannel.jestRequireDepth ?? 0) + 1;
    try {
      const load = createRequire(anchor);
      if (
        filename !== null &&
        (isPath || config.expandAlias(spec) !== spec || state.platformSubpaths.has(filename))
      ) {
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
      ownershipChannel.jestRequireDepth -= 1;
      if (actual) {
        state.bypass = null;
        state.presetActual = undefined;
      }
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
    entry.pending = null;
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
    const modules = worker()?.evaluatedModules;
    if (modules) resetEvaluatedModules(modules);
    state.isolation = null;
    state.dropProjectModules();
    allEntries().forEach(forget);
    return Boolean(modules);
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
      // Jest's own error, word for word and a plain Error (index.js:1074-1078 and
      // 1092-1096): Vitest's toThrow with an Error instance compares the whole error,
      // name and own properties included, so only this matches a suite written for Jest.
      throw new Error(`${name} cannot be nested inside another ${name} or ${other}.`);
    }
    const modules = worker()?.evaluatedModules;
    const isolation = {
      modules: state.dropProjectModules(),
      had: new Set(allEntries().filter((entry) => entry.has)),
      vite: modules ? new Map() : null,
    };
    if (modules) resetEvaluatedModules(modules, isolation.vite);
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
      if (modules) restoreEvaluatedModules(modules, isolation.vite);
    };
  };

  /**
   * Drop the registrations. The compat setup clears the test file's own before each
   * file (`keepLibrary`): libraries' registrations were settled already, by the native
   * setup, which runs first and keeps those `keep` says. The hot runtime clears
   * everything at the file boundary, before the setup files run again.
   */
  state.clear = ({ keepLibrary = false, keep: kept } = {}) => {
    const keep = (map) => {
      for (const [key, entry] of map) {
        if (!((keepLibrary && entry.library) || kept?.(entry))) map.delete(key);
      }
    };
    keep(state.entries);
    keep(state.unresolved);
    keep(state.byCall);
    // Decisions are derived from the registrations: recomputed after any clear.
    state.decided.clear();
    state.bypass = null;
    state.isolation = null;
  };

  state.isEmpty = () => state.entries.size === 0 && state.unresolved.size === 0;

  /**
   * What the registered mocks can be reached by, rebuilt after a registration changes:
   * the package names a bare request can name them by, and the package directories
   * their files are in. `wide` when an entry is outside node_modules (a project file)
   * or a virtual mock of a path, which any request may reach through an alias or a
   * relative path, so every request is resolved, as when this index did not exist.
   */
  function reachIndex() {
    if (reach !== null) return reach;
    const names = new Set();
    const dirs = new Set();
    let wide = false;
    for (const [file, entry] of state.entries) {
      const dir = installedPackageDirOf(file);
      if (dir === null) {
        wide = true;
        break;
      }
      dirs.add(dir);
      names.add(owningPackageOfFile(file));
      // An npm alias installs a package under a name its manifest does not carry.
      if (typeof entry.spec === "string" && isBare(entry.spec)) {
        names.add(packageNameOf(entry.spec));
      }
    }
    for (const spec of state.unresolved.keys()) {
      if (isBare(spec)) names.add(packageNameOf(spec));
      else wide = true;
    }
    reach = { names, dirs, wide, aliased: new Map() };
    return reach;
  }

  /**
   * Whether a load of `request` from `parent` can be served a registered mock, without
   * resolving it: the mocks a library's Jest setup registers stay in every file, and
   * resolving every require of every file to look for them costs more than the file.
   * A bare request reaches a mock by its package name, or by an alias the require hooks
   * apply when Node cannot resolve it; a path reaches one in the package directory it
   * points into. Any request a mocked package makes may reach its own mocks, since its
   * `react-native` or `browser` field can send even a bare name to its own files, and a
   * subpath import (`#internal`) maps through its importer's manifest.
   */
  state.mayIntercept = (request, parent) => {
    if (state.isEmpty()) return false;
    const index = reachIndex();
    if (index.wide) return true;
    const from = typeof parent?.filename === "string" ? parent.filename : null;
    if (from !== null && index.dirs.has(installedPackageDirOf(from))) return true;
    if (request.startsWith("#") || request.startsWith("file:")) return true;
    if (isBare(request)) {
      if (index.names.has(packageNameOf(request))) return true;
      let aliased = index.aliased.get(request);
      if (aliased === undefined) {
        aliased = config.expandAlias(request) !== request;
        index.aliased.set(request, aliased);
      }
      return aliased;
    }
    if (from === null && !path.isAbsolute(request)) return true;
    const target = from === null ? request : path.resolve(path.dirname(from), request);
    return index.dirs.has(installedPackageDirOf(target));
  };

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
      "[vitest-native] cannot reach Vitest's module graph in this worker, so require() " +
        "may load a second copy of a project module the test imported, and " +
        "jest.isolateModulesAsync() does not isolate import().",
    );
  }
  return state;
}

/**
 * Installed by the native engine's setup in every worker, so a project file that a test
 * imports and that Node later `require`s is one module (`viteInstanceOf`). It is the same
 * registry jest-compat uses; before this, only jest-compat or a library's Jest setup
 * created it, so whether a project file loaded once or twice depended on those. Its call
 * is also the fixed point the registry's baseline is taken at, once per worker.
 */
export function shareProjectModules() {
  const state = nodeRegistry();
  if (state.baselineFixed) return;
  state.baseline = new Set(Object.keys(Module._cache));
  state.baselineFixed = true;
}

/**
 * Vite's instance of a project module this file already evaluated, for a CommonJS
 * consumer, or NONE — so `require('./store')` after `import './store'` is one module,
 * as under Jest's single registry. Read from Vitest's worker state (`getModulesByFile`
 * is Vite's `EvaluatedModules` API). Skipped: nodes mid-evaluation and `mock:` nodes
 * (this registry serves those). The facade adds `__esModule` for Babel's interop, and
 * a write defines a value on the shared exports object, as `require(x).FLAG = true`
 * does under babel-jest.
 *
 * CommonJS that Vite evaluated is told apart by its `default`: a plain data property
 * holding `module.exports` (Vitest's `_createCJSGlobals` stores it there), where an
 * ES module's exports are all getters. Its `module.exports` is what `require` returns,
 * so that value is handed back as is. It used to be skipped, and Node compiled a
 * second copy of the file: the ownership guard reported it (docs/ownership-guard.md).
 */
const viteFacades = new WeakMap();
function viteInstanceOf(filename) {
  const json = filename.endsWith(".json");
  if (!json && !SOURCE_FILE.test(filename)) return NONE;
  const nodes = worker()?.evaluatedModules?.getModulesByFile?.(filename.replace(/\\/g, "/"));
  for (const node of nodes ?? []) {
    if (node.id?.startsWith("mock:") || !node.evaluated || node.exports == null) continue;
    const ns = node.exports;
    // JSON: `require` returns the parsed object, which Vite's module exports as default.
    if (json) return "default" in ns ? ns.default : NONE;
    if (isCommonJsNamespace(ns)) return ns.default;
    return requireFacade(ns);
  }
  return NONE;
}

const bridging = context?.ownershipModel === "resolution";
let bridge = null;
let loadingBridge = false;
/**
 * The require bridge's answer for `filename` (native/bridge.mjs), loaded on first use so
 * a worker that never needs it loads nothing: an ES namespace through the same facade as
 * viteInstanceOf, CommonJS as its module.exports, or NONE for a file Vite does not own or
 * loads through Node (externalized).
 */
function bridgedInstanceOf(filename, parent) {
  if (!SOURCE_FILE.test(filename)) return NONE;
  if (bridge === null) {
    // Loading the bridge is itself a require through this interceptor: it is never bridged.
    if (loadingBridge) return NONE;
    loadingBridge = true;
    try {
      bridge = createRequire(import.meta.url)("../native/bridge.mjs");
    } finally {
      loadingBridge = false;
    }
  }
  if (!bridge.isViteOwned(filename)) return NONE;
  const value = bridge.requireViteOwned(filename, parent);
  if (value === undefined) return NONE;
  return Object.prototype.toString.call(value) === "[object Module]" ? requireFacade(value) : value;
}

/**
 * A bare specifier (a package name). Aliases need no check here: the require hooks
 * apply them only after Node fails, so Node's answer for an aliased name is already the
 * one `state.resolve` would reach.
 */
function isBare(request) {
  return !(request.startsWith(".") || path.isAbsolute(request) || request.startsWith("file:"));
}

/**
 * Node's real path for `request` from `parent` (the require hooks' resolver included), the
 * same call `state.resolve` makes, or null when Node cannot resolve it.
 */
function nodeResolution(request, parent) {
  try {
    const resolved = Module._resolveFilename(request, parent, false);
    return Module.isBuiltin(resolved) ? null : canonical(resolved);
  } catch {
    return null;
  }
}

/** Vite's namespace for CommonJS: `module.exports` as a plain `default` data property. */
const isCommonJsNamespace = (ns) =>
  "value" in (Object.getOwnPropertyDescriptor(ns, "default") ?? {});

/**
 * What `jest.requireActual` returns for a module `vi.importActual` loaded, for a factory
 * jestMockTransform made async (transform.ts): `module.exports` for CommonJS, so
 * `jest.requireActual('./legacy')()` still calls the function a CommonJS file exports.
 *
 * For an ES module, an object as babel-jest's `require()` gives one: `__esModule`, and
 * a member per export that reads the module live. Vite seals a module's namespace, so
 * the namespace itself (or a Proxy over it) cannot take the writes a Jest factory makes
 * to the actual module (`actual.other = jest.fn(); return actual`); here a write
 * replaces that member, and a new key is added, on this object only. One object per
 * module, so every `requireActual` of it in a file is the same object, as under Jest.
 */
const actualObjects = new WeakMap();
export function actualExports(ns) {
  if (ns == null || typeof ns !== "object") return ns;
  if (isCommonJsNamespace(ns)) return ns.default;
  let actual = actualObjects.get(ns);
  if (actual) return actual;
  actual = {};
  for (const key of Object.keys(ns)) {
    Object.defineProperty(actual, key, {
      enumerable: true,
      configurable: true,
      get: () => ns[key],
      set: (value) => {
        Object.defineProperty(actual, key, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      },
    });
  }
  if (!("__esModule" in actual)) {
    Object.defineProperty(actual, "__esModule", {
      value: true,
      configurable: true,
      writable: true,
    });
  }
  actualObjects.set(ns, actual);
  return actual;
}

function requireFacade(ns) {
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

// experimental.nodeMocks (docs: node-mocks-design.md in the planning repository, rules
// R1-R10): a `vi.mock` applies to the modules Node loads, as a jest.mock factory does
// (#322). Vitest keeps the file's mocks in its mocker's registry, keyed by the file Vite
// resolved. A request is served one when the file Node resolves for that requester is
// that file. Off unless the project opts in: it changes what an installed package's own
// require returns.
const nodeMocks = context?.nodeMocks === true;

// R1: only a module's own require is served a Vitest mock. A load with no parent module
// is Node's: its ESM loader evaluating CommonJS an import reached, which is how Vitest
// loads a mocked module's original (importOriginal, vi.importActual, an automock) by
// its URL. That decision for Node's ESM imports is made in loader.mjs's resolve hook.
const madeByVitest = (parentFile) => typeof parentFile !== "string";
const pendingCount = () => globalThis.__vitest_mocker__?.constructor?.pendingIds?.length ?? 0;

/** A mock entry's file: its Vite id as a path, without a query, or null for a virtual id. */
function mockedFileOf(entry) {
  if (typeof entry?.id !== "string") return null;
  let file = entry.id.startsWith("/@fs/") ? entry.id.slice(4) : entry.id;
  const query = file.indexOf("?");
  if (query !== -1) file = file.slice(0, query);
  // A virtual id (the engine's react-native facade for `vi.mock('react-native')`) is
  // Vite's alone: its factory's importOriginal() reaches React Native through Node's
  // require of the package, so it is not served to Node.
  return path.isAbsolute(file) ? canonical(file) : null;
}

/** The directory of the package `file` belongs to, or null outside node_modules. */
function packageDirOf(file) {
  const pkg = owningPackageOfFile(file);
  if (pkg !== null) {
    const norm = file.replace(/\\/g, "/");
    const at = norm.lastIndexOf("/node_modules/") + "/node_modules/".length;
    return norm.slice(0, at + pkg.length);
  }
  return nearestNamedPackage(file)?.dir ?? null;
}

/** The name in the nearest package.json above `file` that names a package, or null. */
function packageNameAt(file) {
  return nearestNamedPackage(file)?.name ?? null;
}

/**
 * A workspace package (a link to source, at its real path): the nearest package.json
 * that names a package, as `{ dir, name }`.
 */
function nearestNamedPackage(file) {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    let name;
    if (packageDirs.has(dir)) name = packageDirs.get(dir);
    else {
      try {
        name = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).name ?? null;
      } catch {
        name = null; // No manifest here, or an unreadable one: look further up.
      }
      packageDirs.set(dir, name);
    }
    if (typeof name === "string") return { dir: dir.replace(/\\/g, "/"), name };
    if (path.dirname(dir) === dir) return null;
  }
}
const packageDirs = new Map();
/** Test seam: the package directory a mock's file and a request's file are compared by. */
export const _packageDirOf = packageDirOf;

/**
 * The current file's Vitest mocks, indexed by the file each mocks, or null when there
 * are none. R6: rebuilt whenever the registry, or any entry in it, is another object
 * (a re-mock or an unmock and a mock change entries without changing their count).
 */
function vitestMocks() {
  const registry = globalThis.__vitest_mocker__?.getMockerRegistry?.();
  const byId = registry?.registryById;
  if (!(byId instanceof Map) || byId.size === 0) return null;
  const held = vitestMocks.held;
  if (held !== undefined && held.registry === registry && held.entries.length === byId.size) {
    let same = true;
    let i = 0;
    for (const entry of byId.values()) {
      if (held.entries[i++] !== entry) {
        same = false;
        break;
      }
    }
    if (same) return held.index;
  }
  const entries = [...byId.values()];
  const index = { byFile: new Map(), packages: new Set(), projectFiles: false };
  for (const entry of entries) {
    const file = mockedFileOf(entry);
    if (file === null) continue;
    index.byFile.set(file, entry);
    const pkg = owningPackageOfFile(file);
    if (pkg !== null) index.packages.add(pkg);
    else {
      index.projectFiles = true;
      // A workspace package, mocked at its real path, is still reached by its name
      // through a node_modules link.
      const name = packageNameAt(file);
      if (name !== null) index.packages.add(name);
    }
  }
  vitestMocks.held = { registry, entries, index: index.byFile.size === 0 ? null : index };
  return vitestMocks.held.index;
}

/** Whether Vitest's registry holds any mock: one Map read, for the registry's side channel. */
const vitestHasMocks = () =>
  (globalThis.__vitest_mocker__?.getMockerRegistry?.()?.registryById?.size ?? 0) > 0;

/**
 * Whether `request` from `parent` can reach a mocked file at all, without resolving it:
 * a package name, an absolute path or a relative request into a mocked package, or into project files
 * when one is mocked. R10: an unrelated request costs this.
 */
function mayReachMock(index, request, parent) {
  if (isBare(request)) return index.packages.has(packageNameOf(request)) || index.projectFiles;
  // An absolute path names its file, so its package is known without resolving it, as
  // React Native's precompiled registry's requires of its helpers are; a relative one
  // stays in its requester's package.
  const pkg = path.isAbsolute(request)
    ? packageOfPath(request)
    : typeof parent?.filename === "string"
      ? owningPackageOfFile(parent.filename)
      : null;
  return pkg === null ? index.projectFiles : index.packages.has(pkg);
}

/** The path a `file:` URL names, or the URL itself when it names none Node accepts. */
function fileOfUrl(url) {
  try {
    return fileURLToPath(url);
  } catch {
    return url;
  }
}

/** The package under the last `node_modules/` of a path, its own directory included. */
function packageOfPath(file) {
  const norm = file.replace(/\\/g, "/").replace(/\/+$/, "");
  const at = norm.lastIndexOf("/node_modules/");
  return at === -1 ? null : packageNameOf(norm.slice(at + "/node_modules/".length));
}

/**
 * The Vitest mock for the file Node resolved for this requester, or undefined (R5: by
 * resolved file only). A package name that resolves to a different file of the package
 * a mock is in, which happens when Vite and Node pick different entry files, fails by
 * name: the mock might be meant, and serving either module would be a guess.
 */
function vitestMockFor(index, request, parent, filename) {
  if (filename === null) return undefined;
  const entry = index.byFile.get(canonical(filename));
  if (entry !== undefined || !isBare(request)) return entry;
  const dir = packageDirOf(filename);
  if (dir === null) return undefined;
  for (const [file, mocked] of index.byFile) {
    if (packageDirOf(file) === dir && mocked.raw === request) {
      throw mockNotSeenByNode(
        request,
        parent,
        `Vite resolves it to ${file} and Node to ${filename}, so the mock cannot be matched`,
      );
    }
  }
  return undefined;
}

/**
 * R3: the module a Vitest mock is, the instance the test's own import gets: a factory's
 * result (Vitest caches it on the entry), an automock's mocked exports, or the module
 * a `__mocks__` redirect evaluated. R9: one that cannot be had synchronously fails by name.
 */
const FACTORY_NOT_SETTLED =
  "its factory is async and has not settled; import the module in the test first";
/** Manual-mock entries whose factory returned a promise that has not settled. */
const settlingFactories = new WeakSet();

/**
 * Whether Vitest is building this mock now: running its factory (its id is on the mock
 * context's callstack until the factory settles), or loading an automock's original.
 * Vitest sets the `mock:` node's `mockedExports` to an empty object before that load and
 * fills it, synchronously, after; a node `jest.resetModules()` reset keeps its filled
 * object. A request for the file meanwhile comes from inside the build, the original's
 * own graph, and is the real module, as Vitest's own load of the original is.
 */
function vitestMockBuilding(entry) {
  const mockId = `mock:${entry.id}`;
  if (globalThis.__vitest_mocker__?.getMockContext?.()?.callstack?.includes?.(mockId)) {
    return true;
  }
  if (entry.type !== "automock" && entry.type !== "autospy") return false;
  const node = worker()?.evaluatedModules?.getModuleById?.(mockId);
  return (
    node?.mockedExports != null &&
    node.evaluated !== true &&
    Object.keys(node.mockedExports).length === 0
  );
}

function vitestMockValue(entry, request, parent) {
  const value = vitestMockModule(entry, request, parent);
  return value === NONE ? NONE : requireFacade(value);
}

/**
 * The module a Vitest mock is, as the test's own import gets it (the factory's result, an
 * automock's mocked exports, the module a redirect evaluated), or NONE while Vitest is
 * building it. R9: one that cannot be had synchronously fails by name.
 */
function vitestMockModule(entry, request, parent) {
  if (vitestMockBuilding(entry)) return NONE;
  if (entry.type === "manual") {
    // Vitest caches a factory's settled result only, and wraps every factory in a
    // synchronous arrow, so whether one is async is known only by calling it. It is
    // called once: while its promise is pending, a require fails by name without calling
    // it again; once it settles, Vitest's own handler has cached the result, which the
    // test's import and every later require share.
    if (entry.cache === undefined && settlingFactories.has(entry)) {
      throw mockNotSeenByNode(request, parent, FACTORY_NOT_SETTLED);
    }
    const value = entry.resolve();
    if (typeof value?.then !== "function") return value;
    settlingFactories.add(entry);
    value.then(
      () => settlingFactories.delete(entry),
      () => settlingFactories.delete(entry),
    );
    throw mockNotSeenByNode(request, parent, FACTORY_NOT_SETTLED);
  }
  const modules = worker()?.evaluatedModules;
  if (entry.type === "automock" || entry.type === "autospy") {
    const node = modules?.getModuleById?.(`mock:${entry.id}`);
    if (node?.mockedExports != null) return node.mockedExports;
  } else if (entry.type === "redirect" && typeof entry.redirect === "string") {
    const node =
      modules?.getModuleByUrl?.(entry.redirect) ?? modules?.getModuleById?.(entry.redirect);
    // Evaluated in this file: the hot runtime resets an earlier file's node in place.
    if (node?.evaluated === true) return node.exports;
  }
  throw mockNotSeenByNode(
    request,
    parent,
    `Vitest builds this ${entry.type} module when the test imports it, which it has not yet`,
  );
}

/**
 * R7: a `vi.doMock` Vitest has queued but not registered (it registers queued mocks on
 * the test's next import) of the file this requester resolved. Matched per requester:
 * the pending specifier is resolved from where it was written.
 *
 * Returns true when the file is unmocked for Node already: a jest.* call decided it
 * (state.decided), jest-compat holds no mock for it, and the last queued action for it
 * is an unmock (`jest.dontMock`/`doUnmock`'s own). Vitest's registry still holds the
 * mock that unmock replaces until the next import, so the caller serves the real module,
 * as Jest does from the call on, instead of that stale mock.
 */
function assertNoPendingMockOf(state, filename, request, parent) {
  const pending = globalThis.__vitest_mocker__?.constructor?.pendingIds;
  if (!Array.isArray(pending) || pending.length === 0 || filename === null) return false;
  const target = canonical(filename);
  const decided = state.decided.has(target);
  let last;
  for (const queued of pending) {
    if (
      (queued?.action !== "mock" && queued?.action !== "unmock") ||
      typeof queued.id !== "string"
    ) {
      continue;
    }
    const resolved = state.resolveFrom(queued.id, queued.importer);
    if (resolved === null || canonical(resolved) !== target) continue;
    if (!decided) {
      throw mockNotSeenByNode(
        request,
        parent,
        `it was ${queued.action}ed after the test's last import, and Vitest applies that on the next one`,
      );
    }
    last = queued.action;
  }
  // A jest.* call decided this file for Node already: its queued action is applied here.
  return last === "unmock" && !state.entries.has(target);
}

const marks = new WeakMap();
let lastMark = 0;
/** A number unique to `entry` (a mock registration) for the life of the worker. */
function markOf(entry) {
  let mark = marks.get(entry);
  if (mark === undefined) marks.set(entry, (mark = ++lastMark));
  return mark;
}

function mockNotSeenByNode(request, parent, reason) {
  const from = typeof parent?.filename === "string" ? parent.filename : "Node";
  const error = new VitestNativeError(
    "MOCK_NOT_SEEN_BY_NODE",
    `the vi.mock of '${request}' cannot be served to ${from}'s require: ${reason}. ` +
      `Import the mocked module in the test before the code that requires it, or give ` +
      `the mock a synchronous factory.`,
  );
  // Also said out loud, once: a package that probes an optional dependency with
  // `try { require(x) } catch {}` would otherwise turn this into "not installed".
  if (!reportedNotSeen.has(error.message)) {
    reportedNotSeen.add(error.message);
    console.warn(error.message);
  }
  return error;
}
const reportedNotSeen = new Set();

/**
 * Whether a relative require that landed on `filename`, mocked for a whole package
 * (`jest.mock('react-native-reanimated', …)`), is the package reaching its own entry as
 * Metro resolves it: its `react-native` field. The engine registers the mock for that
 * file; Jest registers it for `main`, so under Jest such a require gets the real module
 * (`react-native-reanimated/mock` imports `./index`, which the factory would otherwise
 * require itself through). A package whose mocked file is its `main` gets the mock, as
 * under Jest.
 */
function isPackageOwnRelativeLoad(entry, request, filename, parentFile) {
  if (typeof request !== "string" || !request.startsWith(".")) return false;
  if (typeof entry.spec !== "string" || !isWholePackageRequest(entry.spec)) return false;
  if (typeof parentFile !== "string" || typeof filename !== "string") return false;
  const rnEntry = resolvePackageMainField(
    entry.spec,
    path.dirname(parentFile),
    config.platform,
    sourceExts.length > 0 ? sourceExts : undefined,
  );
  return rnEntry !== null && canonical(rnEntry) === canonical(filename);
}

function installLoadHook(state) {
  // The outermost load step (LOAD_STEPS): a per-file mock beats a preset and the registry.
  nodeDispatch().load.add(
    "mocks",
    (next) =>
      function (request, parent, ...rest) {
        // A project file is what a test or a Node-loaded project module requires. Only
        // those requests can share Vite's instances; any request can hit a mock, but
        // only when there is one.
        const fromProject =
          typeof parent?.filename === "string" &&
          !NODE_MODULES.test(parent.filename) &&
          state.isResettable(parent.filename);
        if (Module.isBuiltin(request)) return next(request, parent, ...rest);
        const viMocks = nodeMocks && !madeByVitest(parent?.filename) ? vitestMocks() : null;
        const pendingMocks = nodeMocks && !madeByVitest(parent?.filename) && pendingCount() > 0;
        // A jest.mock this request can reach (mayIntercept), or a vi.mock: otherwise the
        // request is Node's, and only a project file goes further.
        const mockable = state.mayIntercept(request, parent);
        if (!fromProject && !mockable && viMocks === null && !pendingMocks) {
          return next(request, parent, ...rest);
        }
        // A jest.mock (this registry) is matched first, then a vi.mock (Vitest's). R8:
        // jest.requireActual's own load is never a vi.mock either; it takes the path
        // below, whose lookup gives it the real module.
        const actualLoad =
          state.bypass !== null &&
          state.bypass === (state.resolve(request, parent) ?? `\0${request}`);
        // No jest.mock this request can reach (an empty registry, or one holding only
        // other packages' registrations, such as a library's own Jest setup): a vi.mock
        // decides first.
        if (!mockable && !actualLoad && (viMocks !== null || pendingMocks)) {
          const served = serveVitestMock(viMocks, pendingMocks, request, parent, () =>
            state.resolve(request, parent),
          );
          if (served !== NONE) return served;
          // R10: a request no mock matched is Node's, as it was with no mocks at all.
          if (!fromProject) return next(request, parent, ...rest);
        }
        // With no mock it can reach, only a project file can be served from Vite. For a bare specifier,
        // Node's own answer decides: a file under node_modules goes to Node's loader as is;
        // anything else (a workspace link to source, a package's self-reference, an alias the
        // hooks apply) is resolved as below, reusing that answer.
        if (!mockable && isBare(request)) {
          const resolved = nodeResolution(request, parent);
          if (resolved !== null && NODE_MODULES.test(resolved)) {
            state.stats.toNode++;
            return next(request, parent, ...rest);
          }
          if (resolved !== null) state.resolutions.set(`${parent.filename}\0${request}`, resolved);
        }
        const filename = state.resolve(request, parent);
        const entry = state.lookup(filename, request);
        // R8: requireActual's load is the real module, past a vi.mock too; it may still
        // share Vite's instance of a project file below, as before.
        const bypassed = entry === BYPASSED;
        // A package reaching its own entry relatively, mocked for the whole package, is
        // the real module, as under Jest (isPackageOwnRelativeLoad): no mock serves it.
        const ownRelative =
          entry !== undefined &&
          !bypassed &&
          isPackageOwnRelativeLoad(entry, request, filename, parent?.filename);
        if (entry !== undefined && !bypassed && !ownRelative) return state.valueOf(entry);
        if (!bypassed && !ownRelative && !state.isEmpty() && (viMocks !== null || pendingMocks)) {
          const served = serveVitestMock(viMocks, pendingMocks, request, parent, () => filename);
          if (served !== NONE) return served;
        }
        // A module Node already holds stays the one `require` returns: switching a later
        // require to Vite's copy would change its identity mid-file.
        if (
          fromProject &&
          filename !== null &&
          !state.isolation &&
          !NODE_MODULES.test(filename) &&
          Module._cache[filename] === undefined
        ) {
          // experimental.ownershipModel 'resolution': a file Vite owns is Vite's instance in
          // either load order, evaluated now if Vite has not (native/bridge.mjs). Nothing is
          // put in Module._cache: the next require asks Vite's map again, as this one did. It
          // answers first: it also refuses a module Vite holds that it must not serve (one
          // whose evaluation threw, or one still being evaluated).
          if (bridging) {
            const bridged = bridgedInstanceOf(filename, parent);
            if (bridged !== NONE) return bridged;
          }
          const shared = viteInstanceOf(filename);
          if (shared !== NONE) return shared;
        }
        return next(request, parent, ...rest);
      },
  );

  // The precompiled React Native registry requires its own modules by id, past
  // Module._load (see registry.mjs). Jest serves `jest.mock('react-native/Libraries/
  // AppState/AppState', …)` to React Native's own `require('./Libraries/AppState/
  // AppState')`, so the registry asks here first. Undefined unless a mock exists.
  Object.defineProperty(globalThis, "__vitest_native_node_mock_for", {
    configurable: true,
    get: () =>
      state.entries.size === 0 && (!nodeMocks || (!vitestHasMocks() && pendingCount() === 0))
        ? undefined
        : nodeMockForRegistry,
  });
  /**
   * `request` and `parentFile`, when the registry has them, are the require as written
   * and the file it is in, for isPackageOwnRelativeLoad, as through Node's loader.
   */
  function nodeMockForRegistry(filename, request, parentFile) {
    const entry = state.lookup(canonical(filename), filename);
    if (entry === BYPASSED) return NONE;
    if (entry !== undefined) {
      // The package's own relative load of its entry is the real module (as above).
      return isPackageOwnRelativeLoad(entry, request, filename, parentFile)
        ? NONE
        : state.valueOf(entry);
    }
    if (!nodeMocks) return NONE;
    if (pendingCount() > 0 && assertNoPendingMockOf(state, filename, filename, null)) return NONE;
    const mocked = vitestMocks()?.byFile.get(canonical(filename));
    return mocked === undefined ? NONE : vitestMockValue(mocked, filename, null);
  }
  nodeMockForRegistry.NONE = NONE;

  // The mock seam of the require bridge (experimental.ownershipModel 'resolution',
  // native/bridge.mjs), which evaluates a Vite-owned module synchronously in Vite's place:
  // each import it makes asks here first, so a mocked dependency is the instance Vitest's
  // own import of it gets (ADR-0007 decision 4; the A3 readiness condition 1).
  const mocks = nodeDispatch().channel("mocks");
  mocks.NONE = NONE;
  /**
   * The id Vitest's registry keys a module by, from the forms the bridge holds it in: an
   * absolute path (a fetch result's id, an external's target), a `file:` URL (an external's
   * target on Windows), or Vite's `/@fs/` URL for a file outside the root.
   */
  const viteIdOf = (id) => {
    if (typeof id !== "string") return id;
    if (id.startsWith("file:")) return fileOfUrl(id).replace(/\\/g, "/");
    if (id.startsWith("/@fs/")) {
      const rest = id.slice("/@fs".length);
      return /^\/[A-Za-z]:\//.test(rest) ? rest.slice(1) : rest;
    }
    return path.isAbsolute(id) ? id.replace(/\\/g, "/") : id;
  };
  /** Whether Node's own `require` and `import` are served Vitest's mocks (nodeMocks). */
  mocks.servesNode = nodeMocks;
  /**
   * The mock for an import of `id` (Vite's id for it: its file, or a virtual id) made by
   * the module at `importerFile`, as the test's own import of it gets it; NONE when none
   * applies; or a `MOCK_NOT_SEEN_BY_NODE` failure naming the importer when one applies
   * but cannot be had synchronously (an async factory that has not settled, an automock
   * or `__mocks__` module Vitest has not built, a `vi.doMock`/`vi.doUnmock` of the file
   * not applied yet). A Vite module's imports are Vite's, so this holds with nodeMocks
   * off too. A jest.mock is matched first, and jest.requireActual's module stays actual,
   * as for Node's require.
   */
  /**
   * A jest.mock as an import gets it, not as `require` does: Vitest's `mock:<id>` module
   * once the test has imported it (jestMockTransform's factory hands Vitest the value
   * through Jest's CommonJS interop, setup.mjs), else that interop of the settled value,
   * so `import X from` reads the whole module of a factory returning a function or
   * named exports only. A factory that has not settled fails by name.
   */
  const jestMockForImport = (entry, id, parent) => {
    const imported = worker()?.evaluatedModules?.getModuleById?.(`mock:${id}`)?.exports;
    if (imported != null) return imported;
    // The bridge evaluates synchronously, so it takes the factory as Node's require does
    // (valueOf): jestMockTransform's original, synchronous one, whose jest.requireActual
    // is synchronous, as under Jest. The value is memoized, so Vite's import of the module
    // later gets the same object. Only a factory the author wrote async, or one Vite has
    // already started, has no synchronous value yet.
    const value = entry.has ? entry.value : (entry.pending ?? state.valueOf(entry));
    if (Object.prototype.toString.call(value) === "[object Promise]") {
      throw mockNotSeenByNode(id, parent, FACTORY_NOT_SETTLED);
    }
    return jestMockInterop(value);
  };
  mocks.forImport = (rawId, importerFile) => {
    const parent = { filename: importerFile };
    const id = viteIdOf(rawId);
    const bare = typeof id === "string" ? id.replace(/[?#].*$/, "") : null;
    const file = bare !== null && path.isAbsolute(bare) ? bare : null;
    if (file !== null) {
      const entry = state.lookup(canonical(file), file);
      if (entry === BYPASSED) return NONE;
      if (entry !== undefined) return jestMockForImport(entry, id, parent);
      if (pendingCount() > 0 && assertNoPendingMockOf(state, file, id, parent)) return NONE;
    }
    const byId = globalThis.__vitest_mocker__?.getMockerRegistry?.()?.registryById;
    // Keyed by Vite's id, as Vitest's registry is: the bridge has the id Vite resolved.
    const entry = byId instanceof Map ? byId.get(id) : undefined;
    if (entry === undefined) return NONE;
    // Vitest's import of a factory mock gets the module it keeps at `mock:<id>` (a proxy
    // that names a missing export); once the test has imported it, that one.
    const imported = worker()?.evaluatedModules?.getModuleById?.(`mock:${entry.id}`)?.exports;
    if (entry.type === "manual" && imported != null && !vitestMockBuilding(entry)) return imported;
    return vitestMockModule(entry, id, parent);
  };

  // experimental.nodeMocks, for Node's ESM loader (loader.mjs), which decides at resolve,
  // where the importer is known (R1), and gives a mocked import its own URL (R2).
  /** Whether `request` from `parentFile` can reach a mock at all, without resolving it. */
  nodeMockForRegistry.mayReach = (request, parentFile) => {
    if (!nodeMocks) return false;
    if (request.startsWith("file:")) request = fileOfUrl(request);
    if (state.entries.size > 0 || pendingCount() > 0) return true;
    const index = vitestMocks();
    return index !== null && mayReachMock(index, request, { filename: parentFile });
  };
  /**
   * A mark for the mock that applies to `file`, as `request` from `parentFile` resolved
   * it, or null: the same mark for the same registration, a new one for each new one.
   */
  nodeMockForRegistry.markFor = (file, request, parentFile) => {
    if (!nodeMocks) return null;
    const parent = { filename: parentFile };
    const jestEntry = state.entries.get(canonical(file));
    if (jestEntry !== undefined) return markOf(jestEntry);
    if (pendingCount() > 0 && assertNoPendingMockOf(state, file, request, parent)) return null;
    const index = vitestMocks();
    const entry = index === null ? undefined : vitestMockFor(index, request, parent, file);
    // A mark is a cache entry for good: none for a mock Vitest is still building.
    return entry === undefined || vitestMockBuilding(entry) ? null : markOf(entry);
  };

  // A Vitest mock for this request, or NONE: the pending check (R7) and the match (R5).
  function serveVitestMock(index, pending, request, parent, resolve) {
    const reachable = index !== null && mayReachMock(index, request, parent);
    if (!reachable && !pending) return NONE;
    const filename = resolve();
    if (pending && assertNoPendingMockOf(state, filename, request, parent)) return NONE;
    if (!reachable) return NONE;
    const entry = vitestMockFor(index, request, parent, filename);
    return entry === undefined ? NONE : vitestMockValue(entry, request, parent);
  }
}
