// Node ESM loader hook (registered via module.register). Intercepts import() of RN —
// which Module._extensions cannot — Flow-stripping and serving boundary mock source.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { transformRN, isFlow, cjsExportNames, needsTransform } from "./transform.mjs";
import { boundarySourceFor } from "./boundary.mjs";
import { nativeAssetModuleSource } from "./assets.mjs";
import { extensionsFor, resolveRelativePlatformFile, resolveDeepPackageFile } from "./resolve.mjs";
import {
  NODE_MODULES_PATH,
  isUtilitySubpath,
  packageNameOf,
  presetPackageOfFile,
  requestForPackageFile,
  subpathLeafOf,
} from "./match.mjs";
import {
  createNativeOwnershipPolicy,
  isRuntimeResidentFile,
  isTestRuntimeResidentFile,
  parseNativeOwnershipManifest,
} from "./ownership.mjs";

// Any file living under a node_modules directory. Platform-extension resolution
// (`.native.js` etc.) applies to every node_modules package, not just RN, matching
// Metro — which resolves platform variants project-wide. (Without this, e.g.
// `@react-navigation/native` silently loads its `.js`/web variant instead of
// `.native.js`, breaking the navigation lifecycle with no error.)
// React Native's main entry (`react-native/index.js`).
const RN_INDEX = /[\\/]react-native[\\/]index\.js$/;
const TRANSFORMABLE = /\.(jsx?|tsx?|mjs|cjs)$/;
// Extensions/index candidates for bundler-style extensionless resolution.

/**
 * Bundler-style resolution for an extensionless relative import: try `base+ext`
 * then `base/index+ext`. Metro/webpack accept these; Node's strict ESM resolver
 * doesn't, which breaks externalized libs that ship ESM with extensionless imports
 * (e.g. @expo/vector-icons' `import './createIconSet'`, react-native-webview's
 * `./WebView`). Returns the on-disk path, or null.
 */
function resolveExtensionless(base) {
  const extensions = HAS_SOURCE_PROFILE
    ? extensionsFor(PLATFORM, SOURCE_EXTS)
    : [".js", ".cjs", ".mjs", ".json", ".jsx", ".ts", ".tsx"];
  for (const ext of extensions) {
    const f = base + ext;
    if (fs.existsSync(f)) return f;
  }
  for (const ext of extensions) {
    const f = path.join(base, "index" + ext);
    if (fs.existsSync(f)) return f;
  }
  return null;
}
// Synthetic URL scheme for preset mocks served to the ESM graph (see below).
const PRESET_SCHEME = "vitest-native-preset:";
// A preset reached by resolved file: only CommonJS that this loader compiled requires
// through that path (see presetRequestForFile), and on Node 22.13 that `require` reads
// a CommonJS cache an ES module job never fills ("Cannot read properties of undefined
// (reading 'exports')"). So it is served as CommonJS, through the same function the
// require hook uses for the package name (hooks.mjs).
const PRESET_CJS_SCHEME = "vitest-native-preset-cjs:";
let PROJECT_ROOT = process.cwd();
let PLATFORM = "ios";
let REACT_NATIVE_VERSION = "0.0.0";
let SOURCE_EXTS = ["js", "jsx", "json", "ts", "tsx"];
let HAS_SOURCE_PROFILE = false;
let isExtra = () => false;
let ownership = createNativeOwnershipPolicy({ projectRoot: PROJECT_ROOT });
// Preset package name → its mock's named-export list (from the preset definition).
let presetExports = {};
// Asset file extensions (without leading dot, lower-cased) the loader serves as Metro asset modules.
let assetExtSet = new Set();

/**
 * Hot-runtime ESM generation (experimental, `VITEST_NATIVE_HOT_ESM_GEN=1`).
 *
 * Node's ESM registry has no invalidation API, so a package a TEST FILE reaches
 * through `import` keeps its module state for the whole run — the per-file reset
 * can only clear the CommonJS cache. That is the hot runtime's one measured
 * correctness hole at scale (see validation/idiomatic/scale, `extstore`).
 *
 * The registry is keyed by full URL, query included, so stamping a generation onto
 * the URL makes the next file's import a different module and Node evaluates it
 * again. The counter lives in a SharedArrayBuffer because loader hooks run on their
 * own thread; the worker bumps it in the per-file reset.
 *
 * Cost is bounded by ownership: a CommonJS package re-enters through Module._cache,
 * which the reset already drops, so only a thin namespace wrapper is retained per
 * generation. A true-ESM package retains its whole instance — which is why this is
 * measured before it is trusted.
 */
let genView = null;
const generationOf = () => (genView ? Atomics.load(genView, 0) : 0);
// The test stack itself: Vitest's runtime, the chai it asserts through, and this
// engine. The worker's runtime holds instances of these from boot — the runner's
// SnapshotClient, chai's extended Assertion, the engine's registry and hooks — and a
// test file reaches the SAME packages through Node's ESM path. Stamping those
// resolutions hands the file a twin runtime: `toMatchSnapshot` then asks a
// SnapshotClient no one set up, `vi.useFakeTimers` flips a copy of the timer state
// the runner never reads, and matchers extend a chai the expect chain doesn't use.
//
// The workspace gates cannot catch a miss here: in-repo, this package and the
// validation suites resolve OUTSIDE node_modules, so the NODE_MODULES_PATH guard
// below exempts the engine by accident of layout. Only a packed install — the
// bake-off apps — puts the whole test stack under node_modules where stamping can
// reach it. That is how this list was earned: react-native-paper under the hot
// runtime, 603/678 -> 473/648, every extra failure a twin-runtime symptom. The
// actual resident package rules live once in ownership.mjs.
/** Should this resolved file carry a generation stamp? */
function versionable(url) {
  if (!genView || !url.startsWith("file:")) return false;
  const norm = fileURLToPath(url).replace(/\\/g, "/");
  if (!NODE_MODULES_PATH.test(norm)) return false;
  // React Native itself is preloaded once per worker and shared deliberately —
  // re-instantiating it per file would undo the reason the worker stays warm.
  if (ownership.isReactNativeFile(norm) || isRuntimeResidentFile(norm)) return false;
  if (isTestRuntimeResidentFile(norm)) return false;
  return true;
}

export function initialize(data) {
  if (data && data.projectRoot) PROJECT_ROOT = data.projectRoot;
  PLATFORM = data?.platform === "android" ? "android" : "ios";
  if (data && data.reactNativeVersion) REACT_NATIVE_VERSION = data.reactNativeVersion;
  HAS_SOURCE_PROFILE = Array.isArray(data?.sourceExts);
  SOURCE_EXTS = HAS_SOURCE_PROFILE ? data.sourceExts : ["js", "jsx", "json", "ts", "tsx"];
  const configuredOwnership = parseNativeOwnershipManifest(process.env.VITEST_NATIVE_OWNERSHIP);
  ownership = createNativeOwnershipPolicy({
    projectRoot: PROJECT_ROOT,
    projectDirs: configuredOwnership?.projectDirs ?? [],
    reactNativeRoots: configuredOwnership?.reactNativeRoots ?? [],
    runtimeTransforms: data?.transformPkgs ?? [],
  });
  isExtra = ownership.matchesNodeTransformedFile;
  if (data && data.presetExports) presetExports = data.presetExports;
  if (data && data.assetExts)
    assetExtSet = new Set(data.assetExts.map((e) => String(e).replace(/^\./, "").toLowerCase()));
  if (data && data.hotGenerationBuffer) genView = new Int32Array(data.hotGenerationBuffer);
}

// A `require()` inside a CommonJS module this loader compiled and returned with its
// source arrives here already resolved, as a file URL (see presetPackageOfFile). Map a
// file inside a preset package back to the request the bare-name redirect above would
// have seen — recovered from the package's own manifest (requestForPackageFile) — and
// apply the same exemptions to it: the entry → the package name, any other file → its
// subpath (served by leaf name, as `pkg/Swipeable` is).
const manifestMemo = new Map();
function packageManifest(pkgDir) {
  if (!manifestMemo.has(pkgDir)) {
    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
    } catch {
      // No readable manifest: the subpath is used as written.
    }
    manifestMemo.set(pkgDir, manifest);
  }
  return manifestMemo.get(pkgDir);
}

function presetRequestForFile(specifier, parent) {
  const file = specifier.startsWith("file:")
    ? fileURLToPath(specifier)
    : path.isAbsolute(specifier)
      ? specifier
      : null;
  if (!file) return null;
  const hit = presetPackageOfFile(file, parent, (pkg) =>
    Object.prototype.hasOwnProperty.call(presetExports, pkg),
  );
  if (!hit) return null;
  const ext = /\.([a-z0-9]+)$/i.exec(hit.subpath)?.[1]?.toLowerCase() ?? "";
  if (ext === "json" || assetExtSet.has(ext)) return null;
  const norm = file.replace(/\\/g, "/");
  const pkgDir = norm.slice(0, norm.length - hit.subpath.length - 1);
  const request = requestForPackageFile(hit.pkg, hit.subpath, packageManifest(pkgDir));
  return isUtilitySubpath(request) ? null : request;
}

function resolveBefore(specifier, context) {
  // Preset redirect (ESM): a bare import of a preset package — whether from the
  // test graph or, crucially, nested inside an externalized third-party lib — is
  // redirected to a synthetic module that re-exports the runtime preset mock. This
  // mirrors the Vite plugin's virtual:preset modules for the Node ESM path.
  // Subpath imports (e.g. react-native-gesture-handler/Swipeable) are redirected
  // too — the real deep entry would pull in the package's native runtime.
  // Exempt: JSON subpaths (package.json version gates), asset subpaths, and
  // Node-safe utility entries (jest-utils, mock, plugin) — those pass through
  // to the real file.
  if (Object.prototype.hasOwnProperty.call(presetExports, specifier)) {
    return { done: { url: PRESET_SCHEME + specifier, shortCircuit: true } };
  }
  if (!specifier.endsWith(".json") && !isUtilitySubpath(specifier)) {
    const specExt = /\.([a-z0-9]+)$/i.exec(specifier);
    if (!specExt || !assetExtSet.has(specExt[1].toLowerCase())) {
      const pkg = packageNameOf(specifier);
      if (pkg !== specifier && Object.prototype.hasOwnProperty.call(presetExports, pkg)) {
        return { done: { url: PRESET_SCHEME + specifier, shortCircuit: true } };
      }
    }
  }

  const parent =
    context.parentURL && context.parentURL.startsWith("file:")
      ? fileURLToPath(context.parentURL)
      : null;
  const presetRequest = presetRequestForFile(specifier, parent);
  if (presetRequest) {
    const file = specifier.startsWith("file:") ? fileURLToPath(specifier) : specifier;
    const query = new URLSearchParams({ request: presetRequest, file });
    return {
      done: { url: `${PRESET_CJS_SCHEME}?${query}`, format: "commonjs", shortCircuit: true },
    };
  }
  let resolved;
  if (
    parent &&
    (NODE_MODULES_PATH.test(parent) || ownership.isReactNativeFile(parent) || isExtra(parent)) &&
    specifier.startsWith(".") &&
    !path.extname(specifier)
  ) {
    const hit = resolveRelativePlatformFile(specifier, parent, PLATFORM, SOURCE_EXTS);
    // Not returned directly: `json` is a Metro source extension, so this can now
    // land on a .json file, which still needs the import attribute injected below.
    if (hit) resolved = { url: pathToFileURL(hit).href, shortCircuit: true };
  }

  return { parent, resolved };
}

/** Node's resolver failed: fall back the way Metro would, or rethrow. */
function resolveRecover(err, specifier, parent) {
  let resolved;
  // Fallback: an extensionless relative import that Node's ESM resolver rejected
  // but a bundler (Metro) would accept. Common in externalized RN libs shipping
  // ESM with extensionless imports. Resolve it on disk ourselves.
  if (parent && specifier.startsWith(".") && !path.extname(specifier)) {
    const hit = resolveExtensionless(path.resolve(path.dirname(parent), specifier));
    if (hit) resolved = { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  // RN 0.87's exports map rejects the deep self-references its own Babel
  // preset emits (react-native/src/private/...); Metro resolves them via its
  // legacy-deep-imports condition. Mirror Metro by path (see resolve.mjs).
  if (!resolved) {
    const deep = resolveDeepPackageFile(
      specifier,
      parent ? path.dirname(parent) : PROJECT_ROOT,
      PLATFORM,
      SOURCE_EXTS,
    );
    if (deep) resolved = { url: pathToFileURL(deep).href, shortCircuit: true };
  }
  if (!resolved) throw err;
  return resolved;
}

function resolveAfter(resolved, context) {
  // JSON imports without an explicit `with { type: 'json' }` attribute throw
  // ERR_IMPORT_ATTRIBUTE_MISSING on Node 22+. RN ecosystem packages do
  // `import pkg from './package.json'` unconditionally (e.g. @react-navigation).
  // Inject the attribute so Node's OWN native JSON module loader handles it —
  // leaning on the platform rather than synthesizing a module source.
  if (resolved.url.endsWith(".json")) {
    return {
      ...resolved,
      importAttributes: {
        ...(resolved.importAttributes ?? context.importAttributes),
        type: "json",
      },
      shortCircuit: true,
    };
  }

  // Stamp the hot generation so the next test file re-evaluates this module rather
  // than reusing the ESM registry's copy. `fileURLToPath` ignores the query, so
  // `load` and every on-disk read below are unaffected.
  if (versionable(resolved.url)) {
    const gen = generationOf();
    if (gen > 0 && !resolved.url.includes("vnhot=")) {
      return { ...resolved, url: `${resolved.url}?vnhot=${gen}`, shortCircuit: true };
    }
  }
  return resolved;
}

// Node caches default resolutions by (specifier, parent URL). Under the hot runtime a
// parent URL carries the generation stamp (`?vnhot=N`, see versionable), so every test
// file re-resolved every externalized import from scratch — profiled as Node
// re-reading package.json scopes to decide module formats, the largest remaining cost
// after the loader moved in-thread. Resolution never depends on the stamp, which only
// forces re-evaluation, so successful default resolutions are kept per unstamped parent:
// the same caching Node does, made generation-aware. Failures are not kept, so the
// Metro-style fallbacks in resolveRecover run as before.
const STAMP = /[?&]vnhot=\d+/;
const stampedResolutions = new Map();
function stampedResolutionKey(specifier, context) {
  const parent = context.parentURL;
  if (typeof parent !== "string" || !STAMP.test(parent)) return null;
  return [
    specifier,
    parent.replace(STAMP, ""),
    (context.conditions ?? []).join(","),
    JSON.stringify(context.importAttributes ?? {}),
  ].join("\0");
}

// One implementation, two hook APIs. `module.register()` (off-thread, async) is the
// only option before Node 22.15; `module.registerHooks()` runs the same logic
// synchronously on the calling thread, without a cross-thread round trip per
// resolve and load (see installLoaderHooks in setup.mjs).
export async function resolve(specifier, context, nextResolve) {
  const before = resolveBefore(specifier, context);
  if (before.done) return before.done;
  let resolved = before.resolved;
  if (!resolved) {
    const key = stampedResolutionKey(specifier, context);
    // A hit skips nextResolve, which Node accepts only from a short-circuited result.
    const hit = key ? stampedResolutions.get(key) : undefined;
    resolved = hit ? { ...hit, shortCircuit: true } : undefined;
    if (!resolved) {
      try {
        resolved = await nextResolve(specifier, context);
        if (key) stampedResolutions.set(key, resolved);
      } catch (err) {
        resolved = resolveRecover(err, specifier, before.parent);
      }
    }
  }
  return resolveAfter(resolved, context);
}

export function resolveSync(specifier, context, nextResolve) {
  const before = resolveBefore(specifier, context);
  if (before.done) return before.done;
  let resolved = before.resolved;
  if (!resolved) {
    const key = stampedResolutionKey(specifier, context);
    // A hit skips nextResolve, which Node accepts only from a short-circuited result.
    const hit = key ? stampedResolutions.get(key) : undefined;
    resolved = hit ? { ...hit, shortCircuit: true } : undefined;
    if (!resolved) {
      try {
        resolved = nextResolve(specifier, context);
        if (key) stampedResolutions.set(key, resolved);
      } catch (err) {
        resolved = resolveRecover(err, specifier, before.parent);
      }
    }
  }
  return resolveAfter(resolved, context);
}

export async function load(url, context, nextLoad) {
  return loadSync(url, context, nextLoad);
}

/** `load` never awaits: every path returns a result or `nextLoad(...)` directly. */
export function loadSync(url, context, nextLoad) {
  // Serve the synthetic preset module. The generated source reads the mock built
  // by the native setup file from globalThis (this source executes in the main
  // realm, so globalThis is the populated one), mirroring the Vite virtual:preset.
  if (url.startsWith(PRESET_CJS_SCHEME)) {
    const query = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    const source = `module.exports = globalThis.__vitest_native_preset_require(${JSON.stringify(
      query.get("request"),
    )}, ${JSON.stringify(query.get("file"))});`;
    return { format: "commonjs", source, shortCircuit: true };
  }
  if (url.startsWith(PRESET_SCHEME)) {
    const specifier = url.slice(PRESET_SCHEME.length);
    const pkg = packageNameOf(specifier);
    const names = presetExports[pkg] || [];
    // For a subpath import, prefer the mock export matching the leaf module name
    // (pkg/lib/Swipeable → mock.Swipeable) — real deep entries export that one
    // thing as their default. Root imports (and unknown leaves) keep the
    // factory-default-then-namespace behavior; unknown leaves warn under
    // diagnostics since the namespace default is usually not what the importer
    // wanted.
    const leaf = specifier === pkg ? null : subpathLeafOf(specifier);
    const fallback = `("default" in _m ? _m["default"] : _m)`;
    const source = [
      `const _m = (globalThis.__vitest_native_preset_mocks || {})[${JSON.stringify(pkg)}] || {};`,
      ...names.map((n) => `export const ${n} = _m[${JSON.stringify(n)}];`),
      ...(leaf
        ? [
            `const _hit = ${JSON.stringify(leaf)} in _m;`,
            `if (!_hit && process.env.VITEST_NATIVE_DIAGNOSTICS === "true") console.warn(${JSON.stringify(
              `[vitest-native] '${specifier}' has no matching export on the '${pkg}' preset mock; serving the root mock namespace.`,
            )});`,
            `export default (_hit ? _m[${JSON.stringify(leaf)}] : ${fallback});`,
          ]
        : [`export default ${fallback};`]),
    ].join("\n");
    return { format: "module", source, shortCircuit: true };
  }

  if (!url.startsWith("file:")) return nextLoad(url, context);
  const file = fileURLToPath(url);
  const norm = file.replace(/\\/g, "/");

  // Asset imports (`import logo from './logo.png'`, `import font from './Icon.ttf'`)
  // from ANY package: Node's ESM loader can't parse a binary asset as a module and
  // throws. Serve the module Metro generates for it (assets.mjs) — the same one the
  // CJS require hook (hooks.mjs) and the Vite graph serve, registering into React
  // Native's own asset registry through Node's CommonJS loader. Applies regardless of
  // whether the importing package is RN or in `transform`, since assets are pulled in
  // by ecosystem libs too (e.g. `@react-navigation/elements`' back-icon.png).
  const ext = path.extname(norm).slice(1).toLowerCase();
  if (ext && assetExtSet.has(ext)) {
    return {
      format: "module",
      source: nativeAssetModuleSource(file, {
        projectRoot: PROJECT_ROOT,
        platform: PLATFORM,
        format: "esm",
      }),
      shortCircuit: true,
    };
  }

  const rnPath = ownership.reactNativePathFor(file);
  const isRN = rnPath !== null;
  if (!isRN && !isExtra(norm)) return nextLoad(url, context);

  if (isRN) {
    // RN's main index exports everything via lazy getters (`module.exports = {
    // get Appearance() {…}, … }`). When Node imports that CommonJS module from an
    // externalized ESM lib, cjs-module-lexer can't see getter exports, so
    // `import { Appearance } from 'react-native'` throws "does not provide an
    // export named 'Appearance'". Serve a thin CJS re-export of the real
    // (Flow-stripped) index, plus a dead `0 && (module.exports = { … })` hint that
    // cjs-module-lexer DOES recognize — so Node sees the named exports while the
    // real getters stay lazy (no eager load of RN's whole surface). The require()
    // of react-native here goes through the separate Module._extensions hook
    // (hooks.mjs), not this loader, so there's no recursion. Names come from the
    // index's own `get X()` declarations.
    if (RN_INDEX.test(rnPath)) {
      const src = fs.readFileSync(file, "utf8");
      const names = [
        ...new Set([...src.matchAll(/\bget\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1])),
      ].filter((n) => n !== "default" && n !== "__esModule");
      const facade = [
        `const { createRequire } = require("node:module");`,
        `module.exports = createRequire(${JSON.stringify(url)})(${JSON.stringify(file)});`,
        `0 && (module.exports = { ${names.join(", ")} });`,
      ].join("\n");
      return { format: "commonjs", source: facade, shortCircuit: true };
    }
    const boundary = boundarySourceFor(rnPath, PLATFORM, REACT_NATIVE_VERSION);
    if (boundary != null) return { format: "commonjs", source: boundary, shortCircuit: true };
    if (norm.endsWith(".js")) {
      const src = fs.readFileSync(file, "utf8");
      if (isFlow(src))
        return {
          format: "commonjs",
          source: transformRN(file, src, PROJECT_ROOT, PLATFORM),
          shortCircuit: true,
        };
    }
    return nextLoad(url, context);
  }

  // Configured third-party package: transform any JS/TS/JSX source to CJS, and tell
  // Node what it exports.
  //
  // When Node imports a CommonJS module from ESM it decides the named exports with
  // cjs-module-lexer, which reads the source statically and gives up partway through
  // shapes it cannot follow. `module.exports = { A() {}, b: () => 1 }` — ordinary
  // hand-written CommonJS, and common in this ecosystem — yields
  // ["A", "default", "module.exports"]: `b` is missing and a name that is not an
  // export appears. Plain Node behaviour, reproducible with no plugin involved; it
  // became reachable when these packages moved from Vite's graph (whose interop
  // enumerates the real object at run time) to Node's.
  //
  // The dead `0 && (module.exports = { … })` hint is the form the lexer does
  // understand — the same trick react-native's index facade uses below. Names are
  // read from the transform's own output rather than by requiring the module: this
  // hook runs on the module-loader thread, where the CJS require hooks that compile
  // JSX are not installed, so a require here fails with "Unexpected token '<'".
  // Boundary stubs outside react-native (expo's dev-server message socket). The CJS
  // `.ts` hook applies them; without this, a package this loader compiles reached the
  // real `messageSocket.native.ts`, which throws "Cannot create devtools websocket
  // connections in embedded environments" — `import 'expo'` failed in every test.
  const stub = boundarySourceFor(norm, PLATFORM, REACT_NATIVE_VERSION);
  if (stub != null) return { format: "commonjs", source: stub, shortCircuit: true };

  if (TRANSFORMABLE.test(norm)) {
    const src = fs.readFileSync(file, "utf8");
    // Only compile what Node cannot run as published — see needsTransform. A file V8
    // accepts is handed straight back to Node, which is how the toolchain packages a
    // closure walk drags in stop reaching the Babel preset at all.
    if (!needsTransform(file, src)) return nextLoad(url, context);
    const code = transformRN(file, src, PROJECT_ROOT, PLATFORM);
    const names = cjsExportNames(code);
    return {
      format: "commonjs",
      source: names.length > 0 ? `${code}\n0 && (module.exports = { ${names.join(", ")} });` : code,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
