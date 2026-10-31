// Patches Node's CJS loader so RN's internal require() chains are Flow-stripped and
// native-boundary modules are mocked. The companion loader.mjs handles the import() path.
import Module from "node:module";
import { projectContext } from "../context.mjs";
import path from "node:path";
import fs from "node:fs";
import {
  heldTransform,
  transformRN,
  isFlow,
  needsTransform,
  isTransforming,
} from "./transform.mjs";
import { boundarySourceFor } from "./boundary.mjs";
import {
  resolvePlatformFile,
  resolveRelativePlatformFile,
  resolveDeepPackageFile,
} from "./resolve.mjs";
import { NODE_MODULES_PATH, isUtilitySubpath, packageNameOf, subpathLeafOf } from "./match.mjs";
import {
  createNativeOwnershipPolicy,
  findNativeOwnershipConflict,
  parseNativeOwnershipManifest,
} from "./ownership.mjs";
import { explainUntransformedSyntaxError } from "./explain.mjs";
import { nativeAssetModuleSource } from "./assets.mjs";
import { expandAlias } from "../jest-compat/aliases.mjs";
import { noteIfRntlEntryLoaded } from "../rntl-support.mjs";

// Guarded via globalThis, not module scope: under the hot runtime this module
// can be evaluated twice in one worker (once by the worker entry through Node's
// loader, once through Vitest's module runner when the setup file is inlined),
// and the hooks must still install exactly once per worker.
/**
 * Packages whose legacy entry fields make Vite and Node select different files. If
 * both graphs resolve one, the module exists TWICE in the process and module-level
 * state does not cross between them.
 *
 * This is silent by construction: nothing fails, nothing is logged, the second
 * copy simply starts empty. A store configured through one copy reads back
 * unset through the other, so a translated label renders as "" and the test
 * compares empty output against expected output with nothing pointing at the
 * cause. Reported once per package, with both files, because the two paths are
 * what makes it recognisable.
 */
// The fields Vite is configured with for React Native (see plugin.ts), in order.
// Node's CJS resolver uses `main`, which is not in this list at all.
const VITE_MAIN_FIELDS = ["react-native", "module", "jsnext:main", "jsnext"];

const reportedDuplicates = new Set();
const reportedProjectResolutions = new Set();

/** Test seam: the warning is once per package for the life of the worker. */
export function _resetDuplicateReports() {
  reportedDuplicates.clear();
  reportedProjectResolutions.clear();
  cachedProjectDirs = undefined;
}

/**
 * Directories Vite owns outright: the package the run lives in, and any package a
 * `test.include` pattern points into (see plugin.ts). Read from the environment
 * because it has to cross into the worker.
 *
 * Parsed once. This is consulted on every module resolution in the worker, so
 * re-reading and re-parsing the variable per call put a JSON.parse in the hot path.
 */
let cachedProjectDirs;
function projectDirs() {
  if (cachedProjectDirs) return cachedProjectDirs;
  const context = projectContext();
  const ownership = parseNativeOwnershipManifest(context?.ownership);
  const dirs = ownership?.projectDirs ?? context?.projectDirs ?? [];
  cachedProjectDirs = dirs.map((dir) => dir.replace(/\\/g, "/").replace(/\/+$/, "") + "/");
  return cachedProjectDirs;
}

/**
 * Report Node resolution of project source assigned to Vite.
 *
 * This runs in `_resolveFilename`, including for `require.resolve()`. Resolution
 * does not prove execution, much less two live instances. If both graphs evaluate
 * the file, their independent stores can silently return different values. Keep
 * this a conditional risk warning, not a fatal duplicate-instance assertion.
 *
 * Only reported when the requirer is an installed package. A test reaching into its
 * own source deliberately — `jest.requireActual('./src/thing')` — is Node loading
 * project files on purpose, and is not this.
 */
export function checkProjectSourceResolvedByNode(resolved, parent, dirs = projectDirs(), policy) {
  if (typeof resolved !== "string" || (!policy && dirs.length === 0)) return;
  // `_resolveFilename` returns bare names for built-ins (`fs`, `node:fs`, `module`).
  // Resolving that string as a filesystem path makes it look like a relative file
  // inside the project, which produced a page of false twin warnings from Babel's
  // ordinary built-in imports in packed Expo apps.
  if (Module.isBuiltin(resolved)) return;
  const file = resolved.replace(/\\/g, "/");
  // Project source never lives under node_modules, and the project directory
  // contains its own node_modules — so this has to be excluded explicitly.
  if (file.includes("/node_modules/")) return;
  if (policy) {
    // An authoritative policy may assign vendored RN to Node, delegate ownership,
    // or disable enforcement. Never undo that decision with a path heuristic.
    if (findNativeOwnershipConflict(policy, file, "node")?.decision.reason !== "project-source") {
      return;
    }
  } else if (
    !dirs.some((dir) => file.startsWith(dir.replace(/\\/g, "/").replace(/\/+$/, "") + "/"))
  ) {
    return;
  }
  const from = parent && parent.filename ? parent.filename.replace(/\\/g, "/") : "";
  if (!NODE_MODULES_PATH.test(from) || from.includes("/vitest-native/dist/")) return;
  if (reportedProjectResolutions.has(file)) return;
  reportedProjectResolutions.add(file);
  console.warn(
    `[vitest-native] Node resolved a file from the package under test.\n` +
      `  file      ->  ${resolved}\n` +
      `  requested by ->  ${parent.filename}\n` +
      "  resolution observed -> Node; policy owner -> Vite (project-source)\n" +
      "  Resolution alone does not prove execution or duplicate instances. If both Node\n" +
      "  and Vite evaluate this file, their module-level state is not shared.\n" +
      "  This risk occurs when an installed React Native package depends on the very\n" +
      "  package whose tests are running. Import it from one side only, or test it from a\n" +
      "  package that does not sit underneath the dependency.",
  );
}
function reportDuplicateInstance(pkg, nodeFile, viteFile, field) {
  reportedDuplicates.add(pkg);
  console.warn(
    `[vitest-native] '${pkg}' resolves to two different files.\n` +
      `  Node (require) ->  ${nodeFile}\n` +
      `  Vite ("${field}") ->  ${viteFile}\n` +
      "  If both module systems load it, the package exists twice and module-level state —\n" +
      "  stores, React contexts, event emitters, registries — is not shared between the copies.\n" +
      "  Nothing throws: writes through one are simply invisible to the other, so values read\n" +
      "  back unset. Only a risk: this compares Node's resolution against Vite's default\n" +
      "  main fields, and cannot see whether Vite loaded the package at all. Align the two\n" +
      "  (`resolve.mainFields`, matching the fields above), or import the package from one\n" +
      "  side only.",
  );
}

/**
 * Compare what Node just resolved against what Vite's field order would pick for
 * the same package. A difference means the two module systems WOULD hold different
 * files for one package id, so anything importing it from both sides gets two copies
 * with separate state.
 *
 * Only a risk, never proof: Vite's graph is not visible from here, so a package Node
 * alone ever requires looks the same as one both graphs load. That is why the caller
 * runs this under `diagnostics` rather than by default.
 */
export function checkResolverAgreement(request, resolved) {
  const pkg = packageOf(request);
  if (!pkg || typeof resolved !== "string") return;
  if (reportedDuplicates.has(pkg)) return;
  const marker = `${path.sep}node_modules${path.sep}`;
  const at = resolved.lastIndexOf(marker + pkg.split("/").join(path.sep) + path.sep);
  if (at === -1) return;
  const dir = resolved.slice(0, at + marker.length + pkg.length);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return;
  }
  const field = VITE_MAIN_FIELDS.find((f) => typeof manifest[f] === "string");
  if (!field) return;
  const viteFile = path.resolve(dir, manifest[field]);
  if (viteFile === resolved) return;
  reportDuplicateInstance(pkg, resolved, viteFile, field);
}

/** The npm package a bare specifier belongs to, or null for relative/absolute ones. */
function packageOf(request) {
  if (!request || request.startsWith(".") || request.startsWith("/") || request.startsWith("\\")) {
    return null;
  }
  const parts = request.split("/");
  return request.startsWith("@") ? (parts[1] ? `${parts[0]}/${parts[1]}` : null) : parts[0];
}

export function installRequireHooks(
  projectRoot,
  transformPkgs = [],
  platform = "ios",
  reactNativeVersion = "0.0.0",
  assetExts = [],
  sourceExts = ["js", "jsx", "json", "ts", "tsx"],
) {
  if (globalThis.__vitest_native_require_hooks_installed) {
    // Install once per worker — but not with a frozen transform list. The hot
    // worker installs the hooks at BOOT, before the setup file has built the
    // preset mocks and can extend the list with preset-shadowed packages (their
    // pass-through entries are compiled only if named here); a pure no-op would
    // pin the boot-time env list forever, and the divergence is hot-only because
    // under stock the setup file IS the first caller. Rebuild the matcher when
    // a later caller brings a different list; hook layers are never stacked.
    globalThis.__vitest_native_require_hooks_update?.({
      transformPkgs,
      assetExts,
      sourceExts,
    });
    return;
  }
  globalThis.__vitest_native_require_hooks_installed = true;

  // Asset requires (`require('./logo.png')`, `require('./Icon.ttf')`) reaching
  // Node's CJS loader must not be compiled — the binary would fall through to the
  // `.js` handler and throw "SyntaxError: Invalid or unexpected token". They are
  // compiled into the module Metro generates instead (native/assets.mjs): it
  // registers the asset's Metro descriptor with React Native's asset registry and
  // exports the id, so the Node path and the Vite graph agree and
  // Image.resolveAssetSource can resolve what either returns.
  const NON_ASSET = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx", ".json", ".node"]);
  let assetExtSet = new Set(assetExts.map((e) => String(e).replace(/^\./, "").toLowerCase()));
  let activeSourceExts = sourceExts;
  const installAssetExtensions = (extensions) => {
    for (const raw of extensions) {
      const ext = "." + String(raw).replace(/^\./, "");
      if (NON_ASSET.has(ext) || Module._extensions[ext]) continue;
      Module._extensions[ext] = function (mod, filename) {
        mod._compile(
          nativeAssetModuleSource(filename, { projectRoot, platform, format: "cjs" }),
          filename,
        );
      };
    }
  };
  installAssetExtensions(assetExts);

  // Configured third-party packages to also transform (Flow/TS/JSX stripped).
  // `let` + the updater below: the hot worker installs the hooks at boot with the
  // raw env list, and the setup file re-calls with the preset-extended one.
  const configuredOwnership = parseNativeOwnershipManifest(projectContext()?.ownership);
  const ownershipBase = {
    projectRoot,
    projectDirs: configuredOwnership?.projectDirs ?? [],
    reactNativeRoots: configuredOwnership?.reactNativeRoots ?? [],
    serverDepsInlineAll: configuredOwnership?.enforcement === "overridden-by-inline-all",
  };
  let ownership = createNativeOwnershipPolicy({
    ...ownershipBase,
    runtimeTransforms: transformPkgs,
  });
  let isExtra = ownership.matchesNodeTransformedFile;
  let isExtraKey = JSON.stringify(transformPkgs);
  // A field left out keeps its current value (tests-native/resolution-memo.test.ts
  // changes the source extensions alone, and puts them back).
  let activeAssetExts = assetExts;
  globalThis.__vitest_native_require_hooks_update = (next) => {
    const pkgs = next.transformPkgs ?? JSON.parse(isExtraKey);
    const nextSourceExts = next.sourceExts ?? activeSourceExts;
    activeAssetExts = next.assetExts ?? activeAssetExts;
    // Platform resolution and the deep-import fallback resolve with these, so a
    // memoized resolution made with others no longer holds.
    if (JSON.stringify(nextSourceExts) !== JSON.stringify(activeSourceExts)) resolutions.clear();
    activeSourceExts = nextSourceExts;
    assetExtSet = new Set(activeAssetExts.map((e) => String(e).replace(/^\./, "").toLowerCase()));
    installAssetExtensions(activeAssetExts);
    const key = JSON.stringify(pkgs);
    if (key === isExtraKey) return;
    isExtraKey = key;
    ownership = createNativeOwnershipPolicy({ ...ownershipBase, runtimeTransforms: pkgs });
    isExtra = ownership.matchesNodeTransformedFile;
  };

  // Preset redirect (CJS): when an externalized third-party module require()s a
  // preset package by its bare name (e.g. @gorhom/bottom-sheet → require(
  // 'react-native-gesture-handler'), or moti → require('react-native-reanimated')),
  // serve the runtime preset mock instead of loading the real native lib. The Vite
  // plugin already redirects the app/test graph's *direct* imports; this closes the
  // gap for nested requires that reach Node's CJS loader and would otherwise hit
  // the real package's native runtime. The lookup is dynamic (no preset-name list
  // captured at install time) so the hooks can install at hot-worker boot, before
  // the setup file has built the preset mocks.
  // Subpath requires of a preset package (pkg/Swipeable) get the mock export
  // matching the leaf name, wrapped in Babel-CJS interop shape ({ __esModule,
  // default }) like the real compiled deep entry — served via a live Proxy so
  // direct-property consumers (`require('pkg/Sub').X`) work too. Memoized per
  // request for identity stability. The memo is keyed by the PER-PACKAGE mock
  // object, not the __vitest_native_preset_mocks container: the hot runtime
  // rebuilds each package's mock per test file while reusing the container, so
  // keying by the container would serve file 1's mocks to every later file in
  // the worker.
  const subpathMemo = new WeakMap();
  function presetSubpathExports(mocks, pkg, request) {
    const mock = mocks[pkg];
    if (mock === null || (typeof mock !== "object" && typeof mock !== "function")) return mock;
    let memo = subpathMemo.get(mock);
    if (!memo) subpathMemo.set(mock, (memo = new Map()));
    if (memo.has(request)) return memo.get(request);
    const leaf = subpathLeafOf(request);
    let exportsValue = mock;
    if (leaf && Object.prototype.hasOwnProperty.call(mock, leaf)) {
      const value = mock[leaf];
      exportsValue =
        value !== null && (typeof value === "object" || typeof value === "function")
          ? new Proxy(value, {
              get: (t, p, r) =>
                p === "default" ? t : p === "__esModule" ? true : Reflect.get(t, p, r),
              has: (t, p) => p === "default" || p === "__esModule" || Reflect.has(t, p),
            })
          : { __esModule: true, default: value };
    } else if (projectContext()?.diagnostics === true) {
      console.warn(
        `[vitest-native] '${request}' has no matching export on the '${pkg}' preset mock; serving the root mock namespace.`,
      );
    }
    memo.set(request, exportsValue);
    return exportsValue;
  }

  // What a require of `request` gets when a preset shadows it, or NO_PRESET. One
  // function for both ways a preset package is required: by name here, and by resolved
  // file from CommonJS that the ESM loader compiled (loader.mjs serves those through
  // globalThis.__vitest_native_preset_require), so the two cannot disagree.
  const NO_PRESET = Symbol("no preset");
  function presetExportsFor(request) {
    const mocks = globalThis.__vitest_native_preset_mocks;
    if (!mocks) return NO_PRESET;
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    // Subpath require of a preset package — the real deep entry would load the
    // package's native runtime. Exempt: JSON subpaths (package.json version
    // gates), asset subpaths (fonts/images, loaded from their real files by
    // the Module._extensions handlers above), and Node-safe utility entries
    // (jest-utils, mock, plugin) — those fall through to the real file.
    const reqExtMatch = /\.([a-z0-9]+)$/i.exec(request);
    const reqExt = reqExtMatch ? reqExtMatch[1].toLowerCase() : "";
    if (reqExt !== "json" && !assetExtSet.has(reqExt) && !isUtilitySubpath(request)) {
      const pkg = packageNameOf(request);
      if (pkg !== request && Object.prototype.hasOwnProperty.call(mocks, pkg)) {
        return presetSubpathExports(mocks, pkg, request);
      }
    }
    return NO_PRESET;
  }
  globalThis.__vitest_native_preset_require = (request, file) => {
    const shadowed = presetExportsFor(request);
    return shadowed === NO_PRESET ? Module._load(file, null, false) : shadowed;
  };

  const origLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    const shadowed = presetExportsFor(request);
    if (shadowed !== NO_PRESET) return shadowed;
    const exports = origLoad.call(this, request, parent, ...rest);
    // Every require of RNTL's main entry, cached or not, tells the setup file's
    // auto-cleanup that this test file loaded it (see noteIfRntlEntryLoaded). Vite's
    // evaluator reports the file's own imports (rntl-hooks.mjs); this sees the entry
    // reached through a package Node loads, such as a shared test-utils that
    // re-exports RNTL.
    noteIfRntlEntryLoaded(exports);
    return exports;
  };

  let requireAliases;
  const resolveAliasedRequest = (request, parent, resolveTarget) => {
    if (requireAliases === undefined) {
      requireAliases = projectContext()?.requireAliases ?? [];
    }
    if (requireAliases.length === 0 || request.startsWith(".") || path.isAbsolute(request)) {
      return null;
    }
    if (!parent?.filename || NODE_MODULES_PATH.test(parent.filename)) return null;
    const expanded = expandAlias(request, requireAliases);
    if (expanded === request) return null;
    if (path.isAbsolute(expanded) && !path.extname(expanded)) {
      const hit = resolvePlatformFile(expanded, platform, activeSourceExts);
      if (hit) return hit;
    }
    try {
      return resolveTarget(expanded);
    } catch {
      return null;
    }
  };
  // Node keys Module._cache by the path its resolver returns: the real path
  // (Module._findPath → toRealPath), unless symlinks are preserved. A path found
  // here instead must be spelled the same way, or one file loads twice: once under
  // Node's key and once under ours — on Windows an alias target written with `/`,
  // anywhere a target reached through a symlink.
  const preserveSymlinks =
    process.execArgv.includes("--preserve-symlinks") || process.env.NODE_PRESERVE_SYMLINKS === "1";
  const nodeKeys = new Map();
  const asNodeResolves = (file) => {
    let key = nodeKeys.get(file);
    if (key === undefined) {
      key = path.resolve(file);
      if (!preserveSymlinks) {
        try {
          key = fs.realpathSync(key);
        } catch {
          // Missing: leave it to the loader to report.
        }
      }
      nodeKeys.set(file, key);
    }
    return key;
  };
  // Resolutions this hook made, per requiring directory, for the life of the worker.
  //
  // The hot runtime drops every module a test file loaded, and its reset drains the
  // matching entries from Node's relativeResolveCache (module-reset.mjs), so a library
  // re-loaded by the next file is resolved again, request by request. A package
  // resolved through its `exports` map never reaches Module._pathCache either
  // (Module._findPath returns the exports result before writing it), so each of those
  // ran Node's whole bare-specifier resolution again: package scope, exports map,
  // directory stats. Each relative, extensionless request ran the platform resolution
  // above again: the extension list, the library's Jest resolver, the path joins. A
  // library that is its own test mock (reanimated's, since #336) re-loads a few hundred
  // files per test file. Counted on a 60-file gesture-handler + reanimated suite, per
  // file: 168 resolutions reached Node, 122 of them missing its caches; with the memo
  // 22 and 1.
  //
  // A bare request's hit is checked with one stat, so a file that no longer exists is
  // resolved again (measured: about 150 stats per test file on the suite above, against
  // about 700 had relative hits been checked too, which the platform resolution's cache
  // already answers without one):
  // Node stats the lookup directories of an `exports` resolution on every call, and
  // falls back to an outer copy when a nested one is removed. What the stat does not
  // see is a copy installed NEARER than the one held: Node, which does not cache an
  // `exports` resolution, would find it, and the memo keeps the outer one until the
  // worker ends. Accepted: Node is already that stale for every package resolved
  // through `main` (Module._pathCache is never invalidated) and for every edit to a
  // package.json it has read (cached for the life of the process), the platform
  // resolution's own cache (resolve.mjs) lives as long as the worker, and watch mode
  // does not watch node_modules. Checking every directory between the parent and the
  // held copy on each hit is the work the memo exists to remove.
  //
  // Keyed as Node keys relativeResolveCache, by the parent's directory and the request,
  // plus the conditions Node's module hooks pass: within one process every other input
  // to these resolutions is a function of those (and of the source extensions, which
  // clear it when they change). Successful resolutions only, so a failure, and the
  // fallbacks after it, run again. A relative request with an extension, an absolute
  // one, a built-in, `require.resolve` with `paths` and the main module are left to
  // Node. The memo sits inside this hook, under the hot reset's tracking resolver,
  // which still sees every call.
  //
  // Not done instead: keeping the libraries resident (no reset exists for their mock
  // state, so it would leak between files), compiling their graphs into the precompiled
  // registry (a much larger change for the same resolutions), and caching only the
  // decisions of a library's own Jest resolver (measured under 1% of the cost).
  //
  // Counters, a stable contract for diagnostics and measurement (the tests assert the
  // work itself instead, Node's resolver calls and source reads, which a memo that
  // counted a hit and resolved anyway would not fake): `globalThis[Symbol.for("vitest-native.resolutionMemo")]`
  // is `{ hits, misses, stale }`, one object per worker thread. `misses` counts the
  // keyed requests this hook resolved itself (platform resolution, Node and the
  // fallbacks), `hits` those the memo answered, and `stale` the held resolutions whose
  // file was gone (each also a miss). Requests the memo does not key are in none of
  // them. All only grow.
  const resolutions = new Map();
  const resolutionStats = (globalThis[Symbol.for("vitest-native.resolutionMemo")] ??= {
    hits: 0,
    misses: 0,
    stale: 0,
  });
  const resolutionKey = (request, parent, [isMain, options]) => {
    if (typeof request !== "string" || typeof parent?.path !== "string" || isMain) return null;
    // A relative request with an extension, and an absolute one, Node answers from
    // Module._pathCache; a built-in it answers at once.
    if (request.startsWith(".") ? path.extname(request) !== "" : path.isAbsolute(request)) {
      return null;
    }
    if (Module.isBuiltin(request)) return null;
    // Node's in-thread module hooks resolve a require with `{ conditions }` (Node 26
    // adds `paths: undefined` to it); any other option that is set (`require.resolve`'s
    // `paths`) is left to Node.
    let conditions = "";
    if (options != null) {
      const set = (name) => options[name] !== undefined;
      if (Object.keys(options).some((name) => name !== "conditions" && set(name))) return null;
      if (options.conditions != null) conditions = [...options.conditions].join(",");
    }
    return `${parent.path}\0${request}\0${conditions}`;
  };
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...rest) {
    let resolved;
    const key = resolutionKey(request, parent, rest);
    if (key !== null) {
      const held = resolutions.get(key);
      // A bare request's hit costs one stat: a file removed since (a nested copy
      // uninstalled, a fixture a test deleted) is resolved again, as Node would, instead
      // of failing to load. A relative one is answered as the platform resolution's own
      // cache would answer it (resolve.mjs), which does not look at the disk again.
      if (
        held !== undefined &&
        (request.startsWith(".") || fs.statSync(held, { throwIfNoEntry: false })?.isFile())
      ) {
        resolutionStats.hits++;
        resolved = held;
      } else {
        if (held !== undefined) {
          resolutionStats.stale++;
          resolutions.delete(key);
        }
        resolutionStats.misses++;
      }
    }
    // Relative, extensionless: Metro's platform order for every parent, app source
    // included (`./PlatformInfo` → `index.native.ts` before `index.ts`).
    if (!resolved && parent?.filename && request.startsWith(".") && !path.extname(request)) {
      resolved = resolveRelativePlatformFile(request, parent.filename, platform, activeSourceExts);
      if (resolved) resolved = asNodeResolves(resolved);
    }
    if (!resolved) {
      try {
        resolved = origResolve.call(this, request, parent, ...rest);
      } catch (err) {
        // The project's aliases (resolve.alias string entries, and tsconfig `paths` when
        // Vite resolves them for imports): a `require('#/lib/x')` in a test reaches here,
        // not Vite. Only for requests from project files — packages never see the
        // project's aliases, under Vite or Metro — and only once Node has failed, so no
        // resolution that worked before can change.
        const aliased = resolveAliasedRequest(request, parent, (target) =>
          origResolve.call(this, target, parent, ...rest),
        );
        // RN 0.87's exports map rejects the deep self-references its own Babel
        // preset emits (`react-native/src/private/…`); Metro resolves them via the
        // `react-native-legacy-deep-imports` condition. Mirror Metro by path.
        // From the requiring file first, as Metro does; then from the project, for a
        // parent outside the project's tree — the precompiled registry's cache file
        // when the cache had to fall back to tmpdir.
        const fromDir = parent?.filename ? path.dirname(parent.filename) : projectRoot;
        const deep =
          aliased ??
          resolveDeepPackageFile(request, fromDir, platform, activeSourceExts) ??
          (fromDir === projectRoot
            ? null
            : resolveDeepPackageFile(request, projectRoot, platform, activeSourceExts));
        if (deep === null) throw err;
        resolved = asNodeResolves(deep);
      }
    }
    if (key !== null) resolutions.set(key, resolved);
    // Diagnostics only. The comparison sees Node's resolution and the package
    // manifest, never Vite's module graph, so it cannot tell a package both graphs
    // load from one only Node ever requires — and the ecosystem is full of the
    // latter (Babel's source-map packages, RNTL's own test-renderer). Reported as
    // noise on every test file (#201); kept as an opt-in diagnostic for the silent
    // duplicate-instance failure it was written to surface.
    if (projectContext()?.diagnostics === true) {
      checkResolverAgreement(request, resolved);
    }
    // Every successful resolution (including platform hits) crosses this boundary.
    checkProjectSourceResolvedByNode(resolved, parent, projectDirs(), ownership);
    return resolved;
  };

  const origJs = Module._extensions[".js"];
  Module._extensions[".js"] = function (mod, filename) {
    // Babel loading its own toolchain mid-transform: never compile it (see
    // isTransforming in transform.mjs).
    if (isTransforming()) return origJs(mod, filename);
    const norm = filename.replace(/\\/g, "/");
    const rnPath = ownership.reactNativePathFor(filename);
    const boundary = boundarySourceFor(rnPath ?? norm, platform, reactNativeVersion);
    if (boundary != null) return mod._compile(boundary, filename);
    // A selected package's file compiled before, and unchanged since: no need to read it
    // to decide again. The hot runtime re-loads a library a test file used on every file
    // (see transformRN). Not for React Native's own files, which the precompiled
    // registry compiles without the isFlow test below.
    if (rnPath === null && isExtra(norm)) {
      const held = heldTransform(filename, projectRoot, platform);
      if (held !== undefined) return mod._compile(held, filename);
    }
    if (rnPath !== null) {
      const src = fs.readFileSync(filename, "utf8");
      if (isFlow(src))
        return mod._compile(transformRN(filename, src, projectRoot, platform), filename);
    } else if (isExtra(norm)) {
      // Selected for compiling — but only compile what Node cannot run as published.
      // `isFlow` is not enough here (TS `import type` and JSX slip past it), and
      // compiling everything is what handed Babel its own toolchain. See
      // needsTransform: V8 answers the question Node is about to ask.
      const src = fs.readFileSync(filename, "utf8");
      if (needsTransform(filename, src)) {
        return mod._compile(transformRN(filename, src, projectRoot, platform), filename);
      }
      return origJs(mod, filename);
    }
    if (NODE_MODULES_PATH.test(norm)) {
      // A node_modules package we did NOT transform: when Node's compile throws a
      // SyntaxError that fingerprints as untranspiled JSX/Flow/TS, explain the
      // real fix (add the package to `transform: [...]`) instead of leaving a
      // bare "Unexpected token '<'" — the single most common migration blocker.
      try {
        return origJs(mod, filename);
      } catch (err) {
        throw explainUntransformedSyntaxError(err, filename) ?? err;
      }
    }
    return origJs(mod, filename);
  };

  // An `.mjs` file a compiled module requires: Babel turns `import … from "./x.mjs"`
  // into require("./x.mjs"), which is Node's require(esm). Where the ESM loader runs on
  // its own thread (register() before Node 22.15, see installLoaderHooks in setup.mjs),
  // require(esm) does not consult it, so the file, and React Native's Flow source beneath
  // it, ran uncompiled. There the files the loader would compile (React Native's, and
  // packages selected for compiling) are compiled here, as the loader compiles an `.mjs`
  // it is handed (requireFacade in loader.mjs). In-thread hooks see require(esm) and the
  // file's own imports, so Node keeps it there.
  const origMjs = Module._extensions[".mjs"];
  if (origMjs) {
    Module._extensions[".mjs"] = function (mod, filename) {
      if (globalThis.__vitest_native_loader_mode !== "thread" || isTransforming()) {
        return origMjs(mod, filename);
      }
      const norm = filename.replace(/\\/g, "/");
      const rnPath = ownership.reactNativePathFor(filename);
      if (rnPath === null && !isExtra(norm)) return origMjs(mod, filename);
      const boundary = boundarySourceFor(rnPath ?? norm, platform, reactNativeVersion);
      if (boundary != null) return mod._compile(boundary, filename);
      return mod._compile(transformRN(filename, undefined, projectRoot, platform), filename);
    };
  }

  // Node's CJS loader has no `.ts`/`.tsx` handler, so a synchronous
  // `jest.requireActual('./app/Component')` (common in migrated Jest suites, e.g.
  // to spread a real module then override one export) fails to load app TypeScript.
  // App/test code normally runs through Vite; these handlers only fire for Node
  // requires (i.e. requireActual + its transitive requires). Transform via the
  // project's RN Babel preset (strips TS + JSX → CJS).
  for (const ext of [".ts", ".tsx"]) {
    if (Module._extensions[ext]) continue;
    Module._extensions[ext] = function (mod, filename) {
      // Boundary stubs can live in TS sources too (expo publishes src/ alongside
      // build/, and some resolution paths reach the .ts files directly).
      const boundary = boundarySourceFor(
        filename.replace(/\\/g, "/"),
        platform,
        reactNativeVersion,
      );
      if (boundary != null) return mod._compile(boundary, filename);
      // No source: transformRN reads the file only when its compiled output is not
      // already held for this file's size and mtime.
      return mod._compile(transformRN(filename, undefined, projectRoot, platform), filename);
    };
  }
}
