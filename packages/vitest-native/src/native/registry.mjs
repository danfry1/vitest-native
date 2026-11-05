// Precompiled React Native module registry.
//
// The native engine runs RN's real JS, and with isolation on (the default) that
// graph is re-instantiated for every test FILE: ~440 separate Node module loads,
// each paying a filesystem stat, a module-wrapper construction, and a compile-cache
// lookup. Measured on RN 0.86, that is ~59ms for a typical test's slice of RN and
// ~110ms for the full public surface — per file.
//
// This module collapses that into ONE file. At config time we walk RN's require
// graph once, apply exactly the transforms the per-file hooks would apply (native
// boundary source, Flow strip via the project's Babel preset, Metro asset modules), resolve
// every require target statically, and emit a single CJS file of lazy per-module
// factories keyed by real path. A test file then pays one read and one compile.
//
// What is deliberately preserved, because tests depend on all of it:
//   - laziness      — factories run on first require, so a test that touches View
//                     and StyleSheet still does not execute the rest of RN;
//   - module identity — one instance per path per worker, so RN's singletons
//                     (DeviceEventEmitter, Dimensions, Appearance) behave as they do
//                     today, and a deep `react-native/Libraries/...` require from an
//                     ecosystem package resolves to the same instance the app sees;
//   - isolation     — the registry is re-required per test file like any other
//                     module, so nothing leaks between files.
//
// The registry is an optimization, never a semantic: anything it cannot serve falls
// through to the per-file hooks in hooks.mjs / loader.mjs, and a failed build leaves
// the engine running exactly as it did before.
import Module, { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { projectContext } from "../context.mjs";
import { VitestNativeError } from "../errors.mjs";
import {
  transformRN,
  isFlow,
  needsTransform,
  cacheRootFor,
  TRANSFORM_CACHE_VERSION,
} from "./transform.mjs";

import { boundarySourceFor, BOUNDARY_SOURCES } from "./boundary.mjs";
import { resolveTransformPreset } from "./babel-preset.mjs";
import { assetRegistryPathFor, nativeAssetModuleSource } from "./assets.mjs";
import {
  extensionsFor,
  resolveRelativePlatformFile,
  resolveRelativeWithExtensions,
  resolveDeepPackageFile,
  resolvePackageMainField,
  isWholePackageRequest,
} from "./resolve.mjs";
import { createNativeOwnershipPolicy } from "./ownership.mjs";
import { owningPackageOfFile, packageNameOf } from "./match.mjs";
import { libraryExtensionsFor, libraryResolverFiles } from "./jest-resolvers.mjs";
import { nodeDispatch } from "../node-dispatch.mjs";

/**
 * Losing the registry is a silent performance cliff, not a correctness problem:
 * React Native still loads, file by file, and nothing fails. Measured on this
 * package's own native suite (~42 files), that costs roughly 1.4x — 1.8s becomes
 * 2.5-2.8s — and the per-file cost compounds on a real app suite.
 *
 * Both failure paths used to return null in silence (the build path spoke only
 * under `diagnostics`, the cache-directory path never spoke at all), so the
 * fallback was indistinguishable from working normally. A precompile failure is
 * exactly the kind of thing that happens on one machine and not another — it
 * happened on a Windows CI runner while this was being reviewed, and reported
 * nothing but a null.
 *
 * Reported once per distinct cause, so a project failing on both platforms says
 * it once, while two different causes are both visible.
 */
const reportedRegistryFailures = new Set();

/**
 * Exported as a test seam. The shape of the underlying error depends on how the
 * host resolves modules — under the package's own mock-engine test config,
 * `react-native` is aliased to a virtual module and the failure is a one-line
 * argument error, so a test driving `buildRegistry` there can never produce the
 * multi-line "Require stack:" this collapses. Calling it directly is the only way
 * to assert the collapse rather than assume the environment supplies one.
 */
export function _warnRegistryUnavailable(rawReason) {
  warnRegistryUnavailable(rawReason);
}

const LIBRARY_PREFIX = "library registry: ";
function warnRegistryUnavailable(rawReason) {
  // Node appends a "Require stack:" block to resolution failures; one line is
  // enough to identify the cause without turning a warning into a wall of text.
  const reason = String(rawReason).split("\n")[0].trim();
  if (reportedRegistryFailures.has(reason)) return;
  reportedRegistryFailures.add(reason);
  if (reason.startsWith(LIBRARY_PREFIX)) {
    console.warn(
      `[vitest-native] (native) could not precompile the library registry ` +
        `(${reason.slice(LIBRARY_PREFIX.length)}); those libraries load file by file, which ` +
        "is slower. React Native's registry is unaffected, and results are unaffected.",
    );
    return;
  }
  console.warn(
    `[vitest-native] (native) could not precompile the React Native registry (${reason}); ` +
      "falling back to per-file module loading, which is slower. Tests still run and " +
      "results are unaffected. Set VITEST_NATIVE_NO_REGISTRY=1 to opt out silently.",
  );
}

/** Test seam: the warning is once-per-cause for the life of the process. */
export function _resetRegistryFailureReports() {
  reportedRegistryFailures.clear();
}

// Bump when the emitted registry's shape or the walk's semantics change, so a
// stale on-disk registry from an older vitest-native can never be reused.
// 4: asset files compile to Metro's registering module instead of a file-name string.
// 5: the registry's internal require consults jest-compat's Node-side mocks.
// 6: each module keeps its own strictness, and runs with `this` = module.exports.
// 7: modules are stored as source and compiled per module under their own file name.
const REGISTRY_FORMAT_VERSION = 9;

/**
 * Literal `require('…')` / `require("…")` calls. The leading class excludes
 * property access (`foo.require(...)`) and identifiers ending in "require"
 * (`__webpack_require__(...)`), which are not Node requires.
 *
 * Computed requires (`require(someVar)`) are invisible to this scan by design:
 * they resolve at runtime and fall through to the per-file hooks, which is why
 * the hooks must stay installed alongside the registry.
 */
const REQUIRE_RE = /(?:^|[^.\w$])require\(\s*(['"])([^'"]+)\1\s*\)/g;

/** Source that may call `import()`; a false match only costs the loader path (see emit). */
const USES_IMPORT = /\bimport\s*\(/;

/** Extensions Node handles natively and that must not be inlined as JS. */
const PASSTHROUGH_EXT = new Set([".json", ".node", ".wasm"]);

/**
 * Source for one file, applying the same precedence the per-file hooks use:
 * asset module → native-boundary mock → Flow-stripped RN → verbatim.
 */
function sourceFor(
  file,
  { projectRoot, platform, reactNativeVersion, assetExtSet, ownership, library = false },
) {
  const norm = file.replace(/\\/g, "/");
  const ext = path.extname(norm).slice(1).toLowerCase();
  if (ext && assetExtSet.has(ext)) {
    // The Metro asset module (assets.mjs). Scanned like any module: its one
    // require is React Native's asset registry, which must resolve to the
    // registry's own instance of it — the one resolveAssetSource reads.
    return {
      code: nativeAssetModuleSource(file, { projectRoot, platform, format: "cjs" }),
      scan: true,
    };
  }
  if (library && ext === "json") {
    // A library's JSON (its package.json, a data file) is a module of its graph, with
    // the value Node's JSON loader gives it.
    const value = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    return { code: `module.exports = ${JSON.stringify(value)};`, scan: false };
  }
  const boundary = boundarySourceFor(
    ownership.reactNativePathFor(file) ?? norm,
    platform,
    reactNativeVersion,
  );
  if (boundary != null) return { code: boundary, scan: true };
  const src = fs.readFileSync(file, "utf8");
  // A library file is compiled when Node could not run it as published, the test the
  // per-file hooks apply to a package selected for compiling (hooks.mjs). React
  // Native's own files keep the Flow test the registry has always applied to them.
  const compile = library
    ? needsTransform(file, src)
    : /\.(?:ts|tsx|jsx)$/.test(norm) || (norm.endsWith(".js") && isFlow(src));
  if (compile) return { code: transformRN(file, src, projectRoot, platform), scan: true };
  return { code: src, scan: true };
}

/**
 * Resolve one require target from a file, applying the platform-extension
 * resolution the hooks apply inside node_modules (`./Foo` → `Foo.ios.js`), narrowed
 * by a library's own Jest resolver for that library's files, as the hooks narrow it
 * (jest-resolvers.mjs). Returns an absolute path, or null when the target cannot be
 * resolved.
 */
function resolveTarget(request, fromFile, { projectRoot, platform, sourceExts }) {
  if (request.startsWith(".") && !path.extname(request)) {
    const narrowed = libraryExtensionsFor(
      projectRoot,
      request,
      fromFile,
      extensionsFor(platform, sourceExts),
    );
    const hit = narrowed
      ? resolveRelativeWithExtensions(request, fromFile, narrowed)
      : resolveRelativePlatformFile(request, fromFile, platform, sourceExts);
    if (hit) return hit;
  }
  // A whole package through its `react-native` field, as the require hooks resolve it at
  // run time (hooks.mjs), so the registry's module and Node's are one file.
  if (isWholePackageRequest(request)) {
    const entry = resolvePackageMainField(request, path.dirname(fromFile), platform, sourceExts);
    if (entry) return entry;
  }
  try {
    return createRequire(fromFile).resolve(request);
  } catch {
    return null;
  }
}

/** This package's own version — part of the cache key (see registryKey). */
function ownVersion() {
  try {
    return createRequire(import.meta.url)("../../package.json").version ?? "0";
  } catch {
    return "0";
  }
}

function resolvedOrZero(req, request) {
  try {
    return req.resolve(request);
  } catch {
    return "0";
  }
}

function canonicalAdditionalEntries(entries) {
  return [...new Set(entries)].sort();
}

function canonicalAssetExtensions(extensions) {
  return [
    ...new Set(extensions.map((extension) => String(extension).replace(/^\./, "").toLowerCase())),
  ]
    .filter(Boolean)
    .sort();
}

/**
 * Identity of every input that determines the emitted registry's contents.
 *
 * The boundary mocks are compiled INTO the registry, so their SOURCE is hashed,
 * not just their module names: editing a mock's body has to invalidate the cache
 * the same way a Babel upgrade does. Hashing only the names meant a maintainer
 * changing a mock, or a user upgrading to a release that changed one, kept getting
 * the previous behaviour out of the cache with nothing to indicate it.
 *
 * This package's version is in the key for the same reason, covering everything
 * else it contributes — the transform's Babel options, platform resolution, the
 * emitted registry's own shape.
 *
 * Exported for tests. Not part of the public surface — see docs/versioning.md.
 */
export function registryKey({
  projectRoot,
  platform,
  reactNativeVersion,
  assetExts = [],
  sourceExts = ["js", "jsx", "json", "ts", "tsx"],
  additionalEntries = [],
}) {
  const req = createRequire(path.join(projectRoot, "package.json"));
  const version = (name) => {
    try {
      return req(`${name}/package.json`).version ?? "0";
    } catch {
      return "0";
    }
  };
  const transformPreset = resolveTransformPreset(projectRoot);
  const boundaries = crypto.createHash("sha1");
  for (const suffix of Object.keys(BOUNDARY_SOURCES).sort()) {
    boundaries.update(suffix);
    boundaries.update("\0");
    boundaries.update(
      String(boundarySourceFor(`/react-native/${suffix}`, platform, reactNativeVersion)),
    );
    boundaries.update("\0");
  }
  return crypto
    .createHash("sha1")
    .update(
      [
        `f${REGISTRY_FORMAT_VERSION}`,
        // The registry stores TRANSFORMED module source, so a change in what the
        // transform emits must invalidate it. Nothing else here would: the preset and
        // Babel versions are unchanged when the transform's own configuration changes,
        // and ownVersion() is the published package version, which does not move during
        // development. Adding the Flow-enum plugin produced exactly that situation — the
        // transform was fixed and a warm registry kept serving modules built without it.
        `t${TRANSFORM_CACHE_VERSION}`,
        ownVersion(),
        // Where the graph is seeded from. The registry bakes in absolute paths to every
        // package it resolved, so it is only valid for the files those seeds resolve to.
        // Without this, a checkout copied together with its cache reused the original's
        // registry: the manifest check passed because the original's files still
        // existed, and the copy loaded React Native from the original against its own
        // React, failing every test with "more than one copy of React". The same holds
        // when `react-native` starts resolving to a different copy from the same root.
        // Keyed on the resolved files rather than the project root: require.resolve
        // returns the spelling Node loads modules under (real paths, unless
        // --preserve-symlinks), and projects that resolve the same graph — sibling
        // workspaces, a Vitest project in a subdirectory — share one registry.
        ...["react-native", ...canonicalAdditionalEntries(additionalEntries)].map((request) =>
          resolvedOrZero(req, request),
        ),
        assetRegistryPathFor(projectRoot) ?? "0",
        platform,
        reactNativeVersion,
        version("react-native"),
        // React Native's modules resolve `react` at runtime, so the registry is only
        // valid for the React it was built against. This was missing, and the manifest
        // check below could not cover it: it stats React Native's own files, which do
        // not change when React alone is upgraded. Upgrading React while staying on the
        // same React Native therefore served a registry built against the previous one,
        // and the suite failed with a null React dispatcher ("Cannot read properties of
        // null (reading 'useContext')") plus React Native singletons that no longer
        // compared equal — the duplicate-instance failure this cache exists to avoid.
        // Reproduced by switching between two trees differing only in React's version;
        // clearing node_modules/.cache/vitest-native was the only way out.
        version("react"),
        // React Native's own image assets are compiled in, and their descriptors carry
        // Expo's fileHashes when Expo bundles the project (native/assets.mjs).
        version("expo"),
        // The preset React Native compiles with (babel-preset.mjs), by name and version.
        transformPreset ? `${transformPreset.name}@${transformPreset.version}` : "0",
        version("@babel/core"),
        process.env.BABEL_ENV || process.env.NODE_ENV || "none",
        ...sourceExts.map((extension) => `source:${extension}`),
        ...canonicalAssetExtensions(assetExts).map((extension) => `asset:${extension}`),
        ...canonicalAdditionalEntries(additionalEntries).map((entry) => `entry:${entry}`),
        boundaries.digest("hex"),
      ].join("\0"),
    )
    .digest("hex")
    .slice(0, 16);
}

/**
 * True when every file the cached registry was built from is still present and
 * unchanged (same size and mtime). ~440 stats, a few milliseconds — cheap enough
 * to pay per run, and it means an edited or reinstalled React Native rebuilds
 * instead of silently serving stale code.
 */
function manifestValid(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) return false;
  for (const [file, mtimeMs, size] of manifest) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      return false;
    }
    if (st.size !== size || st.mtimeMs !== mtimeMs) return false;
  }
  return true;
}

/**
 * Emit the registry source for the walked module set.
 *
 * Each module is stored as its source text and compiled on first require under its own
 * file name, with the parameters of Node's CommonJS wrapper, and run with `this` =
 * module.exports. Stack frames inside React Native therefore name the real file at the
 * line and column of the module as compiled, the same as the per-file loader, with no
 * source map: Vitest replaces `Error.prepareStackTrace` in its workers and maps only the
 * files it evaluates, so a map on a Node-loaded file never applied there. Each module
 * also keeps its own strictness, as under Node.
 *
 * A module is compiled with `vm.compileFunction`, once per worker: a reset (the hot
 * runtime, once per file) reruns the compiled function without compiling again. The one
 * thing that path cannot do without an experimental Node API is `import()`: it needs
 * `vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER`, which prints an ExperimentalWarning, or
 * a callback that requires `--experimental-vm-modules`. So a module whose source contains
 * `import(` is compiled by Node's own CommonJS loader instead (`Module.prototype._compile`,
 * as the per-file hooks compile it), which resolves `import()` from the module's file.
 * The check is plain text: a match inside a string or a comment only sends that module
 * down the loader path, which is correct for any module.
 *
 * Rejected: `_compile` for every module recompiles each module after every reset, about
 * +6% per file on a 200-file hot suite; reusing `vm.compileFunction` after a first
 * `_compile` load needs a hand-built copy of Node's `require`.
 */
function emit(files, modules, { library = false } = {}) {
  const idOf = new Map(files.map((f, i) => [f, i]));
  const deps = files.map((f) => {
    const out = {};
    const own = library ? owningPackageOfFile(f) : null;
    for (const [request, target] of Object.entries(modules.get(f).deps)) {
      // In a library registry an edge into another package is linked by path, through
      // __out, so a preset shadowing that package applies to it as to any require.
      const id = target === null ? undefined : idOf.get(target);
      out[request] =
        target === null
          ? null
          : id !== undefined && (!library || owningPackageOfFile(target) === own)
            ? id
            : target;
    }
    return JSON.stringify(out);
  });
  // A require that leaves this registry. In React Native's registry that is a Node
  // require at a pre-resolved path. In a library registry, a path that is one of React
  // Native's modules is served from React Native's registry instance instead, so a
  // library and the app share one React Native by construction rather than by
  // re-entering Node's loader for it. A request for a package a preset shadows gets
  // what the per-file hooks give it (__vitest_native_preset_require, hooks.mjs). Any
  // other target, another package of this registry included, is required by path
  // through this file's own require, which Node resolves once per path rather than on
  // every call; a target in this registry comes back to it by path
  // (installRegistry's interceptor).
  const outside = library
    ? [
        `const __names = new Map();`,
        `function __name(q) {`,
        `  let n = __names.get(q);`,
        `  if (n === undefined) {`,
        `    const c = q.charCodeAt(0);`,
        `    const parts = q.split("/");`,
        `    n = c === 46 || c === 47 || q.includes(":") ? null : c === 64 ? parts.slice(0, 2).join("/") : parts[0];`,
        `    __names.set(q, n);`,
        `  }`,
        `  return n;`,
        `}`,
        `function __out(t, q, from) {`,
        // A jest.mock of the target wins, then a preset shadowing it, as for a require
        // that goes through Node's loader (jest-compat's hook runs first there).
        `  const mock = globalThis.__vitest_native_node_mock_for;`,
        `  if (mock !== undefined) {`,
        `    const v = mock(t, q, from);`,
        `    if (v !== mock.NONE) return v;`,
        `  }`,
        `  const rn = __rnIdOf.get(t);`,
        `  if (rn !== undefined) return __rnLoad(rn);`,
        `  const mocks = globalThis.__vitest_native_preset_mocks;`,
        `  const preset = globalThis.__vitest_native_preset_require;`,
        `  if (mocks !== undefined && preset !== undefined) {`,
        `    const name = __name(q);`,
        `    const own = Object.prototype.hasOwnProperty;`,
        `    if (own.call(mocks, q) || (name !== null && own.call(mocks, name))) return preset(q, t);`,
        `  }`,
        `  return __ext(t);`,
        `}`,
      ]
    : [];
  const prologue = [
    // __ext is this file's own require: the escape hatch for targets outside the
    // registry (react, invariant, JSON, anything computed). Pre-resolved absolute
    // paths make those lookups exact rather than re-running Node resolution.
    `const __ext = require, __f = [], __m = [], __s = [], __l = [];`,
    `const Module = __ext("node:module"), { compileFunction } = __ext("node:vm");`,
    `const __params = ["exports", "require", "module", "__filename", "__dirname"];`,
    `let __compiles = 0;`,
    `const __ids = ${JSON.stringify(files)};`,
    `const __deps = [${deps.join(",")}];`,
    `const __dirs = __ids.map((f) => f.slice(0, Math.max(f.lastIndexOf("/"), f.lastIndexOf("\\\\"))));`,
    ...outside,
    `function __req(i) {`,
    `  const map = __deps[i];`,
    `  const r = function (q) {`,
    `    const t = map[q];`,
    `    if (t === undefined || t === null) return __ext(q);`,
    `    if (typeof t !== "number") return ${library ? "__out(t, q, __ids[i])" : "__ext(t)"};`,
    // A jest.mock of a React Native module (jest-compat's per-file registry, see
    // jest-compat/node-registry.mjs) applies to RN's own requires of it, as under
    // Jest. The global is undefined unless such a mock is registered.
    `    const mock = globalThis.__vitest_native_node_mock_for;`,
    `    if (mock !== undefined) {`,
    // With the request and the requiring module, as Node's loader has them.
    `      const v = mock(__ids[t], q, __ids[i]);`,
    `      if (v !== mock.NONE) return v;`,
    `    }`,
    `    return __r(t);`,
    `  };`,
    `  r.resolve = function (q) {`,
    `    const t = map[q];`,
    `    if (t === undefined || t === null) return __ext.resolve(q);`,
    `    return typeof t === "number" ? __ids[t] : t;`,
    `  };`,
    `  r.cache = __ext.cache;`,
    `  return r;`,
    `}`,
    // Cyclic requires resolve against the partially-filled exports object, exactly
    // as Node's loader does: the module record is published before its factory runs.
    `function __r(i) {`,
    `  const hit = __m[i];`,
    `  if (hit !== undefined) return hit.exports;`,
    `  if (__s[i] === null) return __loaderModule(i);`,
    `  const mod = { id: __ids[i], filename: __ids[i], exports: {}, loaded: false, children: [], paths: [] };`,
    `  __m[i] = mod;`,
    `  try {`,
    `    const factory = __f[i] ?? (__compiles++, (__f[i] = compileFunction(__s[i], __params, { filename: __ids[i] })));`,
    // Node calls its CommonJS wrapper with `this` = module.exports.
    `    factory.call(mod.exports, mod.exports, __req(i), mod, __ids[i], __dirs[i]);`,
    `  } catch (e) {`,
    `    __m[i] = undefined;`,
    `    throw e;`,
    `  }`,
    `  mod.loaded = true;`,
    `  return mod.exports;`,
    `}`,
    // A module that uses import(): a real Module compiled by Node's CommonJS loader,
    // whose source is kept in __l. No parent, so a reset leaves nothing holding the
    // previous instance. Its require is the registry's, with pre-resolved targets.
    `function __loaderModule(i) {`,
    `  const mod = new Module(__ids[i]);`,
    `  mod.filename = __ids[i];`,
    `  mod.paths = Module._nodeModulePaths(__dirs[i]);`,
    `  mod.require = __req(i);`,
    `  __m[i] = mod;`,
    `  try {`,
    `    __compiles++;`,
    `    mod._compile(__l[i], __ids[i]);`,
    `  } catch (e) {`,
    `    __m[i] = undefined;`,
    `    throw e;`,
    `  }`,
    `  mod.loaded = true;`,
    `  return mod.exports;`,
    `}`,
  ];
  const sources = files.map((f, i) => {
    const code = modules.get(f).code;
    return USES_IMPORT.test(code)
      ? `__s[${i}] = null; __l[${i}] = ${JSON.stringify(code)};`
      : `__s[${i}] = ${JSON.stringify(code)};`;
  });
  const reset = `reset: () => { __m.length = 0; }, compiles: () => __compiles`;
  // The modules that have run since the last reset: the library registry's per-file
  // cost, which the native suite holds to the modules a file touches.
  const ran = `ran: () => __ids.filter((_, i) => __m[i] !== undefined)`;
  if (library) {
    // A library registry is linked to the worker's React Native registry, whose ids
    // and loader it receives, rather than finding it through a global. Linking runs
    // once per worker; a reset clears instances and keeps compiled functions, as in
    // React Native's registry. Nothing runs until a module is required.
    const packages = [...new Set(files.map(owningPackageOfFile).filter(Boolean))].sort();
    return [
      `module.exports = function link(__rnIds, __rnLoad) {`,
      `const __rnIdOf = new Map(__rnIds.map((f, i) => [f, i]));`,
      ...prologue,
      ...sources,
      `return { ids: __ids, load: __r, ${reset}, ${ran}, packages: ${JSON.stringify(packages)} };`,
      `};`,
    ].join("\n");
  }
  const epilogue = [
    // The entry's exports are the module's value, so `require(registry)` behaves
    // like `require('react-native')`. __registry is the lookup surface the install
    // hook uses to serve deep paths from the same instances.
    `const __entry = __r(0);`,
    `module.exports = __entry;`,
    `Object.defineProperty(module.exports, "__vitestNativeRegistry", {`,
    `  value: { ids: __ids, load: __r, entry: __ids[0], ${reset} },`,
    `  enumerable: false, configurable: true,`,
    `});`,
  ];
  return [...prologue, ...sources, ...epilogue].join("\n");
}

/**
 * A memoised lookup of the packages a file's package depends on as its own: those in
 * its manifest's `dependencies` and `optionalDependencies` that it does not also name
 * as peers. A peer is shared with the app, so it stays outside the library's graph.
 */
function privateDependenciesOf() {
  const byManifest = new Map();
  return (file) => {
    const norm = file.replace(/\\/g, "/");
    const at = norm.lastIndexOf("/node_modules/");
    const pkg = owningPackageOfFile(file);
    if (at === -1 || pkg === null) return EMPTY;
    const manifest = path.join(
      file.slice(0, at + "/node_modules/".length + pkg.length),
      "package.json",
    );
    let names = byManifest.get(manifest);
    if (names === undefined) {
      const json = JSON.parse(fs.readFileSync(manifest, "utf8"));
      const peers = new Set(Object.keys(json.peerDependencies ?? {}));
      names = new Set(
        [
          ...Object.keys(json.dependencies ?? {}),
          ...Object.keys(json.optionalDependencies ?? {}),
        ].filter((name) => !peers.has(name)),
      );
      byManifest.set(manifest, names);
    }
    return names;
  };
}
const EMPTY = new Set();

/** The registry cache directory, or null (warned, or thrown under failOnError). */
function registryDir(projectRoot, failOnError) {
  try {
    const dir = path.join(cacheRootFor(projectRoot), "registry");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (error) {
    if (failOnError) throw error;
    warnRegistryUnavailable(error?.message ?? "cache directory unavailable");
    return null;
  }
}

/** True when a published registry file and its metadata match `key` and its manifest. */
function cachedLayer(registryFile, key) {
  try {
    const meta = JSON.parse(fs.readFileSync(`${registryFile}.json`, "utf8"));
    if (meta.key === key && fs.existsSync(registryFile) && manifestValid(meta.manifest)) {
      return meta;
    }
  } catch {
    // No usable cache entry.
  }
  return null;
}

/**
 * Walk a module graph from `roots` and publish it as one registry file.
 *
 * Shared by React Native's registry and the library registry, so both are built,
 * keyed, validated and published the same way: `inline(target, from)` decides which
 * resolved targets become registry modules; every other resolved target stays a
 * require at a pre-resolved path and is pinned in the manifest.
 */
function publishLayer({ registryFile, key, roots, inline, options, library, pinned = [] }) {
  const modules = new Map();
  const manifest = [];
  // Targets the registry does NOT inline but DOES bake in as pre-resolved absolute
  // paths. They belong in the manifest for the same reason the inlined files do: if
  // one moves or changes, the paths compiled into the registry are wrong. See the
  // note above the externals loop below.
  const externals = new Set();
  const queue = [...roots].reverse();
  let file;
  try {
    walk();
  } catch (error) {
    // What the walk had read when it failed, the failing file included: a recorded
    // failure stands until one of them changes (buildLibraryRegistry).
    error.filesRead = [...manifest.map(([read]) => read), file];
    throw error;
  }
  function walk() {
    while (queue.length > 0) {
      file = queue.pop();
      if (modules.has(file)) continue;
      const { code, scan } = sourceFor(file, { ...options, library });
      const deps = {};
      if (scan) {
        for (const match of code.matchAll(REQUIRE_RE)) {
          const request = match[2];
          if (request in deps) continue;
          const target = resolveTarget(request, file, options);
          deps[request] = target;
          if (target === null) continue;
          const ext = path.extname(target).toLowerCase();
          if (inline(target, file) && (!PASSTHROUGH_EXT.has(ext) || (library && ext === ".json"))) {
            queue.push(target);
          } else {
            externals.add(target);
          }
        }
      }
      modules.set(file, { code, deps });
      const st = fs.statSync(file);
      manifest.push([file, st.mtimeMs, st.size]);
    }
  }

  // Externals are require()d through pre-resolved absolute paths baked into the
  // emitted registry, so the registry is only valid while those paths still point
  // at what they pointed at when it was built. Nothing noticed when they did not:
  // upgrading React served a registry whose baked path was a react directory that
  // no longer existed, and the fallback produced a second React — a null dispatcher
  // and React Native singletons that stopped comparing equal.
  //
  // Naming the packages in the cache key instead would work only for the ones
  // somebody remembered to name. Statting the resolved targets covers every
  // external there is, and covers both node_modules layouts: under bun and pnpm a
  // version change moves the path, so the stat fails; under a flat npm or yarn tree
  // the path survives but the file's size and mtime change.
  for (const target of [...externals, ...pinned]) {
    try {
      const st = fs.statSync(target);
      manifest.push([target, st.mtimeMs, st.size]);
    } catch {
      // Not a real file on disk (a native addon resolved elsewhere, a virtual
      // target). Nothing to pin; the runtime require still decides.
    }
  }

  const files = [...modules.keys()];
  const code = emit(files, modules, { library });
  publishAtomically(registryFile, `${code}\n`);
  publishAtomically(`${registryFile}.json`, JSON.stringify({ key, count: files.length, manifest }));
  return files.length;
}

// Write via a unique temp file then rename: several workers may race here on a
// cold cache, and a reader must never observe a partially written registry.
function publishAtomically(destination, contents) {
  const temporaryFile = `${destination}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, contents);
    try {
      fs.renameSync(temporaryFile, destination);
    } catch (error) {
      // POSIX rename replaces an existing file atomically. Windows rejects that
      // shape, which two cold compiler processes can hit together. Remove only
      // the already-published destination and retry; metadata is committed last,
      // so readers never accept a half-published new registry as valid.
      if (
        process.platform !== "win32" ||
        !["EEXIST", "EPERM", "EACCES"].includes(error?.code) ||
        !fs.existsSync(destination)
      ) {
        throw error;
      }
      fs.rmSync(destination, { force: true });
      fs.renameSync(temporaryFile, destination);
    }
  } finally {
    // A failed write or publication must not leave a growing trail of PID
    // temp files. A fatal process kill is recovered by the next cache miss.
    fs.rmSync(temporaryFile, { force: true });
  }
}

function layerOptions({ projectRoot, platform, reactNativeVersion, assetExts, sourceExts }) {
  return {
    projectRoot,
    platform,
    reactNativeVersion,
    assetExtSet: new Set(assetExts.map((e) => String(e).replace(/^\./, "").toLowerCase())),
    sourceExts,
    ownership: createNativeOwnershipPolicy({ projectRoot }),
  };
}

/**
 * Build (or reuse) the precompiled registry for a project. Returns the registry
 * file path, or null when a registry cannot be produced — in which case the caller
 * simply keeps using the per-file hooks.
 */
export function buildRegistry({
  projectRoot,
  platform = "ios",
  reactNativeVersion = "0.0.0",
  assetExts = [],
  sourceExts = ["js", "jsx", "json", "ts", "tsx"],
  diagnostics = false,
  additionalEntries = [],
  // Internal orchestration controls. `cacheOnly` lets the long-lived Vite process
  // perform the cheap key/manifest check without ever loading Babel or compiling
  // RN. `failOnError` lets the bounded compiler child return a structured failure;
  // ordinary callers keep the warning + correctness-preserving fallback contract.
  cacheOnly = false,
  failOnError = false,
}) {
  // See warnRegistryUnavailable: this is the one path that stays quiet, because
  // the user asked for it.
  //
  // Escape hatch. The registry is transparent by design, but it is also the piece
  // most likely to be implicated if a project sees something unexpected from React
  // Native — so there is a way to take it out of the picture and get the per-file
  // loader back without downgrading.
  if (process.env.VITEST_NATIVE_NO_REGISTRY === "1") {
    if (diagnostics) {
      console.log(
        "[vitest-native] (native) VITEST_NATIVE_NO_REGISTRY=1 — using per-file module loading",
      );
    }
    return null;
  }
  let key;
  try {
    key = registryKey({
      projectRoot,
      platform,
      reactNativeVersion,
      assetExts,
      sourceExts,
      additionalEntries,
    });
  } catch (error) {
    if (failOnError) throw error;
    warnRegistryUnavailable(error?.message ?? "cache directory unavailable");
    return null;
  }
  const dir = registryDir(projectRoot, failOnError);
  if (dir === null) return null;

  const registryFile = path.join(dir, `rn-${platform}-${key}.cjs`);
  const meta = cachedLayer(registryFile, key);
  if (meta !== null) {
    if (diagnostics) {
      console.log(
        `[vitest-native] (native) reusing precompiled RN registry (${meta.count} modules)`,
      );
    }
    return registryFile;
  }

  if (cacheOnly) return null;

  const started = Date.now();
  try {
    const options = layerOptions({
      projectRoot,
      platform,
      reactNativeVersion,
      assetExts,
      sourceExts,
    });
    const req = createRequire(path.join(projectRoot, "package.json"));
    // Keep the public React Native entry first in insertion order: emit() treats
    // module zero as the capsule's default export. Additional ecosystem-owned deep
    // imports are seed roots only; their factories remain lazy like the root graph.
    const roots = [
      req.resolve("react-native"),
      ...canonicalAdditionalEntries(additionalEntries).map((request) => req.resolve(request)),
    ];
    // Asset modules require Metro's assetRegistryPath by absolute path (assets.mjs),
    // and that entry must be a registry module: loaded outside it, its relative
    // require of the registry module (0.87+) would create a second asset array whose
    // ids resolveAssetSource never sees. React Native's own image assets (LogBox)
    // already pull the entry in through their asset modules; seeding it keeps that
    // true without depending on which of React Native's assets the walk reaches.
    const assetRegistry = assetRegistryPathFor(projectRoot);
    if (assetRegistry !== null) roots.push(assetRegistry);
    const count = publishLayer({
      registryFile,
      key,
      roots,
      // Only React Native's own graph is inlined. Everything else — react,
      // invariant, JSON manifests, native addons — stays a normal Node require at a
      // pre-resolved absolute path, so those modules keep their usual identity and
      // are shared with the rest of the worker.
      inline: (target) => options.ownership.isReactNativeFile(target),
      options,
      library: false,
    });
    if (diagnostics) {
      console.log(
        `[vitest-native] (native) precompiled RN registry: ${count} modules in ${Date.now() - started}ms`,
      );
    }
    return registryFile;
  } catch (error) {
    if (failOnError) throw error;
    warnRegistryUnavailable(error?.message ?? "unknown error");
    return null;
  }
}

/**
 * Build (or reuse) the library registry layered on a React Native registry: the
 * module graphs of the packages `libraryEntries` name, compiled the way the per-file
 * hooks compile a package selected for compiling, in one file of lazy factories.
 *
 * Without it, a library that runs as itself in tests — Reanimated as its own mock is
 * about 300 modules — goes through Node's loader module by module in every test file:
 * a resolution, a read and a module object each, the cost React Native's registry
 * removed for React Native. Built here, the walk and its transforms run once per
 * install, like React Native's.
 *
 * Its key extends React Native's key, so anything that rebuilds React Native's
 * registry rebuilds this one, while React Native's key and file never depend on the
 * libraries. A require of a React Native module from a library file is linked to
 * React Native's registry instance when the worker loads it (emit). Only files of
 * the entries' own packages are inlined; their other dependencies stay requires at
 * pre-resolved paths, pinned in the manifest, as React Native's are.
 *
 * Returns the file, or null when there is nothing to build or it cannot be built, in
 * which case those packages keep loading through the per-file hooks.
 */
export function buildLibraryRegistry({
  projectRoot,
  platform = "ios",
  reactNativeVersion = "0.0.0",
  assetExts = [],
  sourceExts = ["js", "jsx", "json", "ts", "tsx"],
  diagnostics = false,
  additionalEntries = [],
  libraryEntries = [],
  cacheOnly = false,
  failOnError = false,
}) {
  const entries = canonicalAdditionalEntries(libraryEntries);
  if (entries.length === 0 || process.env.VITEST_NATIVE_NO_REGISTRY === "1") return null;
  let key;
  let roots;
  try {
    const req = createRequire(path.join(projectRoot, "package.json"));
    roots = entries.map(
      (request) =>
        (isWholePackageRequest(request) &&
          resolvePackageMainField(request, projectRoot, platform, sourceExts)) ||
        req.resolve(request),
    );
    key = crypto
      .createHash("sha1")
      .update(
        [
          registryKey({
            projectRoot,
            platform,
            reactNativeVersion,
            assetExts,
            sourceExts,
            additionalEntries,
          }),
          ...entries.map((entry, i) => `library:${entry}\0${roots[i]}`),
        ].join("\0"),
      )
      .digest("hex")
      .slice(0, 16);
  } catch (error) {
    if (failOnError) throw error;
    warnRegistryUnavailable(error?.message ?? "library entries unavailable");
    return null;
  }
  const dir = registryDir(projectRoot, failOnError);
  if (dir === null) return null;

  const registryFile = path.join(dir, `lib-${platform}-${key}.cjs`);
  const failureFile = `${registryFile}.failed.json`;
  const meta = cachedLayer(registryFile, key);
  if (meta !== null) {
    if (diagnostics) {
      console.log(
        `[vitest-native] (native) reusing precompiled library registry (${meta.count} modules)`,
      );
    }
    return registryFile;
  }
  // A build of these inputs that failed is not attempted again until one of the
  // files it read changes: a library registry is an optimisation, and relaunching
  // the compiler on every run to fail the same way would cost each run its build.
  const failed = recordedFailure(failureFile, key);
  if (failed !== null) {
    if (failOnError) throw new VitestNativeError("LIBRARY_REGISTRY_FAILED", failed);
    warnRegistryUnavailable(`library registry: ${failed}`);
    return null;
  }
  if (cacheOnly) return null;

  const started = Date.now();
  try {
    const options = layerOptions({
      projectRoot,
      platform,
      reactNativeVersion,
      assetExts,
      sourceExts,
    });
    const packages = new Set(roots.map(owningPackageOfFile));
    const privateDependencies = privateDependenciesOf();
    const count = publishLayer({
      registryFile,
      key,
      roots,
      // The entries' packages, and the packages each inlined package depends on as its
      // own (`dependencies`, not peers, which it shares with the app). React Native's
      // files belong to React Native's registry.
      inline: (target, from) => {
        if (options.ownership.isReactNativeFile(target)) return false;
        const pkg = owningPackageOfFile(target);
        return (
          pkg !== null &&
          (packages.has(pkg) ||
            pkg === owningPackageOfFile(from) ||
            privateDependencies(from).has(pkg))
        );
      },
      options,
      library: true,
      // The libraries' own Jest resolvers chose the files this graph holds.
      pinned: libraryResolverFiles(projectRoot),
    });
    if (diagnostics) {
      console.log(
        `[vitest-native] (native) precompiled library registry: ${count} modules in ${Date.now() - started}ms`,
      );
    }
    return registryFile;
  } catch (error) {
    recordFailure(failureFile, key, error, [...roots, ...libraryResolverFiles(projectRoot)]);
    if (failOnError) throw error;
    warnRegistryUnavailable(`library registry: ${error?.message ?? "unknown error"}`);
    return null;
  }
}

/** The reason a library registry build of `key` failed, while its inputs are unchanged. */
function recordedFailure(failureFile, key) {
  if (!fs.existsSync(failureFile)) return null;
  const record = JSON.parse(fs.readFileSync(failureFile, "utf8"));
  return record.key === key && manifestValid(record.manifest) ? String(record.reason) : null;
}

/** Record a failed library registry build, against the files it read. */
function recordFailure(failureFile, key, error, alwaysRead) {
  const manifest = [];
  for (const file of new Set([...(error?.filesRead ?? []), ...alwaysRead])) {
    const st = typeof file === "string" ? fs.statSync(file, { throwIfNoEntry: false }) : undefined;
    if (st) manifest.push([file, st.mtimeMs, st.size]);
  }
  const reason = String(error?.message ?? error).split("\n")[0];
  publishAtomically(failureFile, JSON.stringify({ key, reason, manifest }));
}

/**
 * Serve React Native from the precompiled registry in this worker.
 *
 * Installed BEFORE the require hooks so that the hooks' preset-mock redirect wraps
 * (and therefore takes precedence over) this one — a preset-shadowed package must
 * still win over anything RN's own graph would provide.
 */
export function installRegistry(
  registryFile,
  projectRoot,
  sourceExts = ["js", "jsx", "json", "ts", "tsx"],
  libraryRegistryFile = undefined,
) {
  if (globalThis.__vitest_native_registry_installed) return true;
  const req = createRequire(path.join(projectRoot, "package.json"));
  let registry;
  try {
    registry = req(registryFile).__vitestNativeRegistry;
    if (!registry) return false;
  } catch {
    return false;
  }
  const library = linkLibraryRegistry(req, libraryRegistryFile, registry);
  // The linked library registry, beside React Native's on the registry's own surface,
  // for the per-file accounting the native suite holds it to.
  registry.library = library?.registry ?? null;
  // Which files the library registry holds, for a preset that requires one by path to
  // get the registry's module (presets/reanimated.ts, ownHelpers).
  nodeDispatch().channel("registry").libraryHolds = (file) => library?.holds(file) === true;
  globalThis.__vitest_native_registry_installed = true;
  // One reset for both layers: a library module holds React Native instances, so it
  // must never outlive the React Native registry instances it was linked to.
  globalThis.__vitest_native_registry_reset = () => {
    registry.reset();
    library?.registry.reset();
  };

  // Node records the loaded file under its real path (`/private/var/…` for macOS's
  // `/var/…` tmpdir), so match the registry file by both spellings.
  let registryRealFile = registryFile;
  try {
    registryRealFile = fs.realpathSync(registryFile);
  } catch {
    // Just loaded, so it exists; an unresolvable path keeps the given spelling.
  }
  const idOf = new Map(registry.ids.map((f, i) => [f, i]));
  const entryId = idOf.get(registry.entry);
  // Beneath a per-file mock and a preset, above Node (LOAD_STEPS).
  nodeDispatch().load.add(
    "registry",
    (next) =>
      function (request, parent, ...rest) {
        if (request === "react-native") return registry.load(entryId);
        // An absolute path lands here when something re-enters through Node's loader
        // with an already-resolved file — most importantly the ESM loader's
        // `react-native/index.js` facade, which requires the real index by path.
        const direct = idOf.get(request);
        if (direct !== undefined) return registry.load(direct);
        if (library !== null) {
          const served = library.serve(request, parent);
          if (served !== NOT_SERVED) return served.value;
        }
        // Deep imports of RN internals (`react-native/Libraries/…`) and of the
        // @react-native/* packages inlined alongside it must resolve to the SAME
        // instances the entry graph uses, or RN's singletons would exist twice.
        if (request.startsWith("react-native/") || request.startsWith("@react-native/")) {
          // The registry's own code requires with the registry FILE as parent, and that
          // file lives in a cache directory that may be outside the project (tmpdir when
          // the project has no writable node_modules). Resolve those from the project.
          const fromProject =
            !parent?.filename ||
            parent.filename === registryFile ||
            parent.filename === registryRealFile ||
            (library !== null && library.isRegistryFile(parent.filename));
          const resolver = fromProject ? req : createRequire(parent.filename);
          const platform = projectContext()?.platform === "android" ? "android" : "ios";
          let resolved;
          try {
            resolved = resolver.resolve(request);
          } catch {
            // RN 0.87's exports map refuses the deep self-references its preset
            // emits; resolve by path (Metro's behavior) so the file still lands on
            // the registry's instance instead of loading a twin outside it.
            resolved =
              (fromProject
                ? null
                : resolveDeepPackageFile(
                    request,
                    path.dirname(parent.filename),
                    platform,
                    sourceExts,
                  )) ?? resolveDeepPackageFile(request, projectRoot, platform, sourceExts);
          }
          const id = resolved === null ? undefined : idOf.get(resolved);
          if (id !== undefined) return registry.load(id);
          // Resolved by path but not in the registry: forward the PATH — reloading
          // the bare specifier would just hit the exports map again.
          if (resolved !== null && path.isAbsolute(resolved)) {
            return next(resolved, parent, ...rest);
          }
        }
        return next(request, parent, ...rest);
      },
  );
  return true;
}

const NOT_SERVED = Symbol("not served");

/**
 * Load and link the library registry, or null when there is none or it cannot be
 * loaded (those packages then keep loading through the per-file hooks).
 *
 * `serve` answers a request the library registry owns: an absolute path that is one
 * of its modules (the ESM loader's facades require by path), a bare request for one of
 * its packages, or a relative request from a file of those packages that Node loaded,
 * resolved from its parent by Node's resolution as the per-file hooks see it. Any
 * other request costs a Set lookup.
 */
function linkLibraryRegistry(req, file, rnRegistry) {
  if (!file) return null;
  let registry;
  // Node records a loaded file under its real path; match the registry's own
  // requires (their parent) by both spellings, as for React Native's registry.
  let spellings;
  try {
    registry = req(file)(rnRegistry.ids, rnRegistry.load);
    spellings = new Set([file, fs.realpathSync(file)]);
  } catch (error) {
    warnRegistryUnavailable(`library registry: ${error?.message ?? error}`);
    return null;
  }
  const idOf = new Map(registry.ids.map((f, i) => [f, i]));
  const packages = new Set(registry.packages);
  const isRegistryFile = (filename) => spellings.has(filename);
  // A request by name, from one directory, is one of the registry's modules for the
  // worker's lifetime: the registry was built from those files and serves them as
  // built, so it is resolved once rather than on every file the worker runs.
  const byName = new Map();
  return {
    registry,
    isRegistryFile,
    /** Whether `file` (its path as Node spells it) is one of the library registry's modules. */
    holds: (filename) => idOf.has(filename),
    serve(request, parent) {
      let id = idOf.get(request);
      if (id === undefined) {
        // A request the registry's own modules could not resolve at build time
        // has nothing to resolve against here either: the per-file hooks decide.
        if (!parent?.filename || isRegistryFile(parent.filename)) return NOT_SERVED;
        // A request for one of its packages by name, or a relative one from a file of
        // those packages that Node loaded (an entry the library never reached, such as
        // semver's index.js): either way the target, when it is one of the registry's
        // modules, is that module, so a package is one set of instances whichever way
        // it is reached.
        const owner =
          request.charCodeAt(0) === 46 /* . */
            ? owningPackageOfFile(parent.filename)
            : packageNameOf(request);
        if (!packages.has(owner)) return NOT_SERVED;
        const key = `${path.dirname(parent.filename)}\0${request}`;
        id = byName.get(key);
        if (id === undefined) {
          let resolved;
          try {
            resolved = Module._resolveFilename(request, parent);
          } catch {
            return NOT_SERVED;
          }
          id = idOf.get(resolved);
          if (id === undefined) return NOT_SERVED;
          byName.set(key, id);
        }
      }
      return { value: registry.load(id) };
    },
  };
}
