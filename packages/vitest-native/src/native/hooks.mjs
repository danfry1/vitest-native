// Patches Node's CJS loader so RN's internal require() chains are Flow-stripped and
// native-boundary modules are mocked. The companion loader.mjs handles the import() path.
import { residentGlobal } from "./resident-globals.mjs";
import { compileSupport, loadSupport } from "./library-jest.mjs";
import Module from "node:module";
import { nodeDispatch } from "../node-dispatch.mjs";
import { CONTEXT_ENV, projectContext } from "../context.mjs";
import { VitestNativeError } from "../errors.mjs";
import path from "node:path";
import fs from "node:fs";
import { heldTransform, transformRN, isFlow, needsTransform } from "./transform.mjs";
import { boundarySourceFor } from "./boundary.mjs";
import {
  extensionsFor,
  hasKnownExtension,
  resolvePlatformFile,
  resolveRelativePlatformFile,
  resolveRelativeWithExtensions,
  resolveDeepPackageFile,
  resolvePackageMainField,
  isWholePackageRequest,
} from "./resolve.mjs";
import {
  NODE_MODULES_PATH,
  isUtilitySubpath,
  owningPackageOfFile,
  packageNameOf,
  isPackageEntryFile,
  subpathLeafOf,
} from "./match.mjs";
import {
  findNativeOwnershipConflict,
  parseNativeOwnershipManifest,
  workerOwnershipPolicy,
} from "./ownership.mjs";
import { explainUntransformedSyntaxError } from "./explain.mjs";
import { nativeAssetModuleSource } from "./assets.mjs";
import { expandAlias } from "../jest-compat/aliases.mjs";
import { noteIfRntlEntryLoaded } from "../rntl-support.mjs";
import { cjsConditionsWithout } from "./export-condition-recovery.mjs";
import {
  ownershipResolverInputs,
  ownershipShadowFile,
  workerSharedResolver,
} from "./shared-resolver.mjs";
import { libraryExtensionsFor } from "./jest-resolvers.mjs";
import { rootSpellings, under } from "./root-spelling.mjs";

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
// Each directory's spellings, once: the check runs for every resolution.
const dirSpellings = new Map();
function spellingsOf(dir) {
  let spellings = dirSpellings.get(dir);
  if (spellings === undefined) {
    // The directory as given too: the paths a caller compares may be spelled that way.
    spellings = [...new Set([dir, ...rootSpellings(dir)])];
    dirSpellings.set(dir, spellings);
  }
  return spellings;
}

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
  } else if (!dirs.some((dir) => spellingsOf(dir).some((spelling) => under(resolved, spelling)))) {
    // In any spelling of the directory (root-spelling.mjs): Node's file name keeps the one
    // its path was reached by, a Windows 8.3 short name too.
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
// Versions read, per worker; directories checked in this test file, cleared per file
// under the hot runtime (resetExpoSdkWarnings), so each file names the copy it loads.
const expoVersions = new Map();
const checkedExpoDirs = new Set();

/** Forget which copies this file was warned about; their versions stay read. */
export function resetExpoSdkWarnings() {
  checkedExpoDirs.clear();
}

/** The hot runtime's check that resetExpoSdkWarnings ran: no copy is still marked warned. */
export function verifyExpoSdkWarningsReset() {
  if (checkedExpoDirs.size > 0) {
    throw new VitestNativeError(
      "HOT_STATE_RESTORE_FAILED",
      `${checkedExpoDirs.size} Expo copies are still marked as warned about`,
    );
  }
}

/** Test seam. */
export function _resetExpoSdkChecks() {
  expoVersions.clear();
  checkedExpoDirs.clear();
}

function manifestVersion(dir) {
  try {
    const { version } = JSON.parse(fs.readFileSync(`${dir}/package.json`, "utf8"));
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * Warn, once per package directory per test file, when a file of `expo` or
 * `expo-modules-core` loads from an Expo SDK outside `sdks` ([min, max], from the
 * plugin). This sees the copy a test loads, where the plugin sees only the project's
 * `expo`. expo-modules-core's major is its SDK's from SDK 55. Any other file costs a
 * substring test, and each package.json is read once per worker.
 */
export function checkLoadedExpoSdk(norm, sdks) {
  if (!sdks || !norm.includes("/node_modules/expo")) return;
  const at = norm.lastIndexOf("/node_modules/") + "/node_modules/".length;
  const name = norm.slice(at, norm.indexOf("/", at));
  if (name !== "expo" && name !== "expo-modules-core") return;
  const dir = norm.slice(0, at + name.length);
  if (checkedExpoDirs.has(dir)) return;
  checkedExpoDirs.add(dir);
  if (!expoVersions.has(dir)) expoVersions.set(dir, manifestVersion(dir));
  const version = expoVersions.get(dir);
  const major = Number(/^(\d+)\.\d+\.\d+(?:[-+].*)?$/.exec(version ?? "")?.[1] ?? NaN);
  const [minimum, maximum] = sdks;
  if (!(major < minimum || major > maximum)) return;
  const list = Array.from({ length: maximum - minimum + 1 }, (_, i) => minimum + i)
    .join(", ")
    .replace(/, (\d+)$/, " and $1");
  const sdk =
    name === "expo-modules-core" && major < 55 ? "Expo SDK 54 or older" : `Expo SDK ${major}`;
  console.warn(
    `[vitest-native] ${name} ${version} (${path.normalize(dir)}) is from ${sdk}; vitest-native supports ` +
      `Expo SDK ${list}. ` +
      (major > maximum
        ? "Check for a newer vitest-native."
        : "Tests that load it can fail: upgrade to a supported Expo SDK."),
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
    return globalThis.__vitest_native_require_hooks_update?.({
      transformPkgs,
      assetExts,
      sourceExts,
    });
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
  let ownership = workerOwnershipPolicy({ ...ownershipBase, runtimeTransforms: transformPkgs });
  let isExtra = ownership.matchesNodeTransformedFile;
  let isExtraKey = JSON.stringify(transformPkgs);
  // Whether these hooks compile a package file for the project, read at call time so a
  // rebuilt matcher (below) answers. Returned by every call, the first and the later ones
  // the updater serves: Expo's runtime is installed only for files this says yes to
  // (globals.mjs installExpoRuntime), one rule for what Node compiles.
  const compiles = (file) => isExtra(String(file).replace(/\\/g, "/"));
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
    if (key === isExtraKey) return compiles;
    isExtraKey = key;
    ownership = workerOwnershipPolicy({ ...ownershipBase, runtimeTransforms: pkgs });
    isExtra = ownership.matchesNodeTransformedFile;
    return compiles;
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
  // Whether the preset's declared names include `request`'s leaf: the list the ESM
  // loader and the plugin decide on (shadowsSubpath in loader.mjs), so every route
  // agrees whatever else the mock object carries.
  function presetExportsLeaf(pkg, request) {
    const leaf = subpathLeafOf(request);
    const names = projectContext()?.presetExports?.[pkg];
    return leaf !== null && Array.isArray(names) && names.includes(leaf);
  }
  // Whether `request` resolves to the package's own entry (pkg/lib/commonjs/index,
  // pkg/src): that is the package itself, and gets the root mock, as the ESM loader's
  // route by resolved file decides (presetRequestForFile in loader.mjs).
  function isPackageEntry(pkg, request, parent) {
    let file;
    try {
      file = Module._resolveFilename(request, parent, false);
    } catch {
      return false;
    }
    return isPackageEntryFile(pkg, file, parent?.filename);
  }
  function presetSubpathExports(mocks, pkg, request) {
    const mock = mocks[pkg];
    if (mock === null || (typeof mock !== "object" && typeof mock !== "function")) return mock;
    let memo = subpathMemo.get(mock);
    if (!memo) subpathMemo.set(mock, (memo = new Map()));
    if (memo.has(request)) return memo.get(request);
    const value = mock[subpathLeafOf(request)];
    const exportsValue =
      value !== null && (typeof value === "object" || typeof value === "function")
        ? new Proxy(value, {
            get: (t, p, r) =>
              p === "default" ? t : p === "__esModule" ? true : Reflect.get(t, p, r),
            has: (t, p) => p === "default" || p === "__esModule" || Reflect.has(t, p),
          })
        : { __esModule: true, default: value };
    memo.set(request, exportsValue);
    return exportsValue;
  }

  // What a require of `request` gets when a preset shadows it, or NO_PRESET. One
  // function for both ways a preset package is required: by name here, and by resolved
  // file from CommonJS that the ESM loader compiled (loader.mjs serves those through
  // globalThis.__vitest_native_preset_require), so the two cannot disagree.
  const NO_PRESET = Symbol("no preset");
  function presetExportsFor(request, parent) {
    const fromFile = parent?.filename;
    const mocks = globalThis.__vitest_native_preset_mocks;
    if (!mocks) return NO_PRESET;
    // jest.requireActual of a shadowed package: this one load is the package itself
    // (jest-compat/node-registry.mjs), as Jest's requireActual gives it.
    const registry = globalThis.__vitest_native_jest_registry;
    if (registry !== undefined && registry.presetActual === request) {
      registry.presetActual = undefined;
      return NO_PRESET;
    }
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
      // Only a subpath whose leaf the mock exports is the mock's (loader.mjs,
      // shadowsSubpath); any other is the real file, as under Jest's jest.mock(pkg). A
      // package's request for one of its own files is the package's business, as a
      // jest.mock of the package name leaves it alone: reanimated's own mock loads the
      // real package, which requires react-native-reanimated/scripts/… by name.
      const fromItself = typeof fromFile === "string" && owningPackageOfFile(fromFile) === pkg;
      if (pkg !== request && !fromItself && Object.prototype.hasOwnProperty.call(mocks, pkg)) {
        if (presetExportsLeaf(pkg, request)) return presetSubpathExports(mocks, pkg, request);
        if (parent !== undefined && isPackageEntry(pkg, request, parent)) return mocks[pkg];
      }
    }
    return NO_PRESET;
  }
  globalThis.__vitest_native_preset_require = (request, file) => {
    const shadowed = presetExportsFor(request);
    return shadowed === NO_PRESET ? Module._load(file, null, false) : shadowed;
  };

  // A preset beats the registry and Node, and yields to a per-file mock (LOAD_STEPS).
  nodeDispatch().load.add(
    "preset",
    (next) =>
      function (request, parent, ...rest) {
        const shadowed = presetExportsFor(request, parent ?? null);
        if (shadowed !== NO_PRESET) return shadowed;
        const exports = next(request, parent, ...rest);
        // Every require of RNTL's main entry, cached or not, tells the setup file's
        // auto-cleanup that this test file loaded it (see noteIfRntlEntryLoaded). Vite's
        // evaluator reports the file's own imports (rntl-hooks.mjs); this sees the entry
        // reached through a package Node loads, such as a shared test-utils that
        // re-exports RNTL.
        noteIfRntlEntryLoaded(exports);
        return exports;
      },
  );

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
    if (path.isAbsolute(expanded) && !hasKnownExtension(expanded, activeSourceExts, assetExtSet)) {
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
          // Node's spelling (fs.realpathSync): the key Module._cache holds the file under (#282).
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
  const resolutionStats = residentGlobal("resolutionMemo", () => ({
    hits: 0,
    misses: 0,
    stale: 0,
  }));
  // Node's in-thread module hooks resolve a require with `{ conditions }` (Node 26 adds
  // `paths: undefined` to it); any other option that is set (`require.resolve`'s
  // `paths`) is Node's to answer.
  const onlyConditions = (options) =>
    options == null ||
    !Object.keys(options).some((name) => name !== "conditions" && options[name] !== undefined);
  const resolutionKey = (request, parent, [isMain, options]) => {
    if (typeof request !== "string" || typeof parent?.path !== "string" || isMain) return null;
    // A relative request with an extension, and an absolute one, Node answers from
    // Module._pathCache; a built-in it answers at once.
    if (request.startsWith(".") ? path.extname(request) !== "" : path.isAbsolute(request)) {
      return null;
    }
    if (Module.isBuiltin(request)) return null;
    if (!onlyConditions(options)) return null;
    const conditions = options?.conditions != null ? [...options.conditions].join(",") : "";
    return `${parent.path}\0${request}\0${conditions}`;
  };
  // experimental.ownershipModel: bare requests resolve through the resolver Vite and
  // the ESM loader use, built from the context's record, which this realm first checks
  // against the conditions Node applies here. Never built with the flag off. The memo
  // above holds its answers, so it keeps none of its own.
  const ownershipContext = projectContext();
  const sharedInputs = ownershipResolverInputs(
    ownershipContext,
    "CommonJS hooks",
    cjsConditionsWithout("react-native"),
  );
  // The resolution shadow, under diagnostics only: it resolves each distinct request a
  // second time, the old way, to record where the answers differ.
  const shadowFile =
    sharedInputs !== null && ownershipContext.diagnostics === true
      ? ownershipShadowFile(process.env[CONTEXT_ENV], ownershipContext.resolverInputsHash)
      : null;
  const sharedResolver =
    sharedInputs === null
      ? null
      : workerSharedResolver(sharedInputs, "cjs", { shadowFile, globalFolders: true });
  // A caller passing other conditions than this realm's (none does but a direct
  // `Module._resolveFilename` call) gets Node's own answer for them.
  const recordConditions = new Set(ownershipContext?.resolverInputs?.conditions ?? []);
  const conditionsMatchRecord = (conditions) =>
    conditions == null ||
    (() => {
      const asked = new Set([...conditions].filter((c) => c !== "react-native"));
      return (
        asked.size === recordConditions.size && [...asked].every((c) => recordConditions.has(c))
      );
    })();
  const onlyDefaultOptions = (options, parent) =>
    options == null ||
    Object.keys(options).every(
      (name) =>
        name === "conditions" ||
        (name === "paths" && options.paths === undefined) ||
        (name === "paths" &&
          Array.isArray(options.paths) &&
          Array.isArray(parent?.paths) &&
          options.paths.length === parent.paths.length &&
          options.paths.every((entry, i) => entry === parent.paths[i])),
    );
  nodeDispatch().resolve.add(
    "hooks",
    (next) =>
      function (request, parent, ...rest) {
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
              // The shared resolver held the same answer: resolve it afresh there too.
              sharedResolver?.forget(request, parent?.filename);
            }
            resolutionStats.misses++;
          }
        }
        // After the memo, so a held answer whose file is gone is resolved afresh here too.
        // `require.resolve(x, { paths })` and the main module are Node's to answer. Not
        // tied to the memo's key: Node 26's module hooks pass a plain require an options
        // object with `paths: undefined` beside its conditions, which is no
        // `require.resolve` option, so this realm still answers it.
        if (
          !resolved &&
          sharedResolver !== null &&
          typeof request === "string" &&
          !request.startsWith(".") &&
          rest[0] !== true &&
          onlyDefaultOptions(rest[1], parent) &&
          conditionsMatchRecord(rest[1]?.conditions)
        ) {
          resolved =
            sharedResolver.resolve(request, parent?.filename, (target) =>
              next(target, parent, ...rest),
            ) ?? undefined;
          if (resolved !== undefined && shadowFile !== null) {
            // The shadow: what Node alone would have answered, once per distinct request
            // (the memo holds the answer after this). Node failing where the resolver
            // answers (a regex alias) is a delta too.
            let previous;
            try {
              previous = next(request, parent, ...rest);
            } catch (error) {
              previous = `unresolved (${error?.code ?? error})`;
            }
            sharedResolver.shadow(request, parent?.filename, resolved, previous);
          }
        }
        // Relative, extensionless: Metro's platform order for every parent, app source
        // included (`./PlatformInfo` → `index.native.ts` before `index.ts`).
        if (
          !resolved &&
          parent?.filename &&
          request.startsWith(".") &&
          !hasKnownExtension(request, activeSourceExts, assetExtSet)
        ) {
          // A library's own Jest resolver can narrow the extensions for its files
          // (jest-resolvers.mjs: worklets' and reanimated's JS implementations).
          const narrowed = libraryExtensionsFor(
            projectRoot,
            request,
            parent.filename,
            extensionsFor(platform, activeSourceExts),
          );
          resolved = narrowed
            ? resolveRelativeWithExtensions(request, parent.filename, narrowed)
            : resolveRelativePlatformFile(request, parent.filename, platform, activeSourceExts);
          if (resolved) resolved = asNodeResolves(resolved);
        }
        // A whole package with a `react-native` field: the file Metro and Vite's import
        // resolve it to, so an import and a require are one module (resolve.mjs). Only a
        // file these hooks can load: TypeScript, or a file they compile; a package they do
        // not compile keeps its `main`, which Node loads as it is.
        if (
          !resolved &&
          parent?.filename &&
          onlyConditions(rest[1]) &&
          isWholePackageRequest(request)
        ) {
          const entry = resolvePackageMainField(
            request,
            path.dirname(parent.filename),
            platform,
            activeSourceExts,
          );
          if (entry && (/\.[cm]?tsx?$/.test(entry) || compiles(entry))) {
            resolved = asNodeResolves(entry);
          }
        }
        if (!resolved) {
          try {
            resolved = next(request, parent, ...rest);
          } catch (err) {
            // The project's aliases (resolve.alias string entries, and tsconfig `paths` when
            // Vite resolves them for imports): a `require('#/lib/x')` in a test reaches here,
            // not Vite. Only for requests from project files — packages never see the
            // project's aliases, under Vite or Metro — and only once Node has failed, so no
            // resolution that worked before can change.
            const aliased = resolveAliasedRequest(request, parent, (target) =>
              next(target, parent, ...rest),
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
      },
  );

  const origJs = Module._extensions[".js"];
  const expoSdks = projectContext()?.expoSdks;
  Module._extensions[".js"] = function (mod, filename) {
    const norm = filename.replace(/\\/g, "/");
    checkLoadedExpoSdk(norm, expoSdks);
    const rnPath = ownership.reactNativePathFor(filename);
    const boundary = boundarySourceFor(rnPath ?? norm, platform, reactNativeVersion);
    if (boundary != null) return mod._compile(boundary, filename);
    // A selected package's file compiled before, and unchanged since: no need to read it
    // to decide again. The hot runtime re-loads a library a test file used on every file
    // (see transformRN). Not for React Native's own files, which the precompiled
    // registry compiles without the isFlow test below.
    if (rnPath === null && isExtra(norm)) {
      const held = heldTransform(filename, projectRoot, platform);
      if (held !== undefined) return compileSupport(mod, held, filename);
    }
    if (rnPath !== null) {
      const src = fs.readFileSync(filename, "utf8");
      if (isFlow(src))
        return compileSupport(mod, transformRN(filename, src, projectRoot, platform), filename);
    } else if (isExtra(norm)) {
      // Selected for compiling — but only compile what Node cannot run as published.
      // `isFlow` is not enough here (TS `import type` and JSX slip past it), and
      // compiling everything is what handed Babel its own toolchain. See
      // needsTransform: V8 answers the question Node is about to ask.
      const src = fs.readFileSync(filename, "utf8");
      if (needsTransform(filename, src)) {
        return compileSupport(mod, transformRN(filename, src, projectRoot, platform), filename);
      }
      return loadSupport(mod, filename, origJs);
    }
    if (NODE_MODULES_PATH.test(norm)) {
      // A node_modules package we did NOT transform: when Node's compile throws a
      // SyntaxError that fingerprints as untranspiled JSX/Flow/TS, explain the
      // real fix (add the package to `transform: [...]`) instead of leaving a
      // bare "Unexpected token '<'" — the single most common migration blocker.
      try {
        return loadSupport(mod, filename, origJs);
      } catch (err) {
        throw explainUntransformedSyntaxError(err, filename) ?? err;
      }
    }
    return loadSupport(mod, filename, origJs);
  };

  // An `.mjs` file Node's require(esm) loads: the in-thread loader compiles what it must
  // (requireFacade in loader.mjs), and this handler only checks Expo's SDK version, as
  // the `.js` handler above does for CommonJS.
  const origMjs = Module._extensions[".mjs"];
  if (origMjs) {
    Module._extensions[".mjs"] = function (mod, filename) {
      checkLoadedExpoSdk(filename.replace(/\\/g, "/"), expoSdks);
      return origMjs(mod, filename);
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
      const norm = filename.replace(/\\/g, "/");
      checkLoadedExpoSdk(norm, expoSdks);
      const boundary = boundarySourceFor(norm, platform, reactNativeVersion);
      if (boundary != null) return mod._compile(boundary, filename);
      // No source: transformRN reads the file only when its compiled output is not
      // already held for this file's size and mtime.
      return compileSupport(mod, transformRN(filename, undefined, projectRoot, platform), filename);
    };
  }
  return compiles;
}
