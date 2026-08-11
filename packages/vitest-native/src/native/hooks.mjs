// Patches Node's CJS loader so RN's internal require() chains are Flow-stripped and
// native-boundary modules are mocked. The companion loader.mjs handles the import() path.
import Module from "node:module";
import path from "node:path";
import fs from "node:fs";
import { transformRN, isFlow, needsTransform } from "./transform.mjs";
import { boundarySourceFor } from "./boundary.mjs";
import { resolvePlatformFile } from "./resolve.mjs";
import {
  NODE_MODULES_PATH,
  REACT_NATIVE_PATH,
  buildPkgMatcher,
  isUtilitySubpath,
  packageNameOf,
  subpathLeafOf,
} from "./match.mjs";
import { explainUntransformedSyntaxError } from "./explain.mjs";

// Guarded via globalThis, not module scope: under the hot runtime this module
// can be evaluated twice in one worker (once by the worker entry through Node's
// loader, once through Vitest's module runner when the setup file is inlined),
// and the hooks must still install exactly once per worker.
/**
 * Packages Vite executes itself (see ecosystem.ts). If Node also resolves one of
 * these, the module exists TWICE in the process — once in Vite's graph, once in
 * Node's — and module-level state does not cross between them.
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
const reportedProjectLoads = new Set();

/** Test seam: the warning is once per package for the life of the worker. */
export function _resetDuplicateReports() {
  reportedDuplicates.clear();
  reportedProjectLoads.clear();
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
  try {
    cachedProjectDirs = JSON.parse(process.env.VITEST_NATIVE_PROJECT_DIRS || "[]").map(
      (dir) => dir.replace(/\\/g, "/").replace(/\/+$/, "") + "/",
    );
  } catch {
    cachedProjectDirs = [];
  }
  return cachedProjectDirs;
}

/**
 * Say so when Node loads the project's own source.
 *
 * The package under test is Vite's (see the ownership rule in apply.ts). If an
 * installed package requires it as well, it exists twice — once in each graph — and
 * the symptom is silence: a store configured through the test's copy reads back unset
 * through the copy the library sees, so an assertion compares "" against the expected
 * text with nothing pointing at the cause. It is the same failure the
 * duplicate-instance warning above covers, arrived at from the other direction: there
 * the two graphs disagree about which FILE the package is, here they agree on the file
 * and still hold separate instances of it.
 *
 * Only reported when the requirer is an installed package. A test reaching into its
 * own source deliberately — `jest.requireActual('./src/thing')` — is Node loading
 * project files on purpose, and is not this.
 */
export function checkProjectSourceLoadedByNode(resolved, parent, dirs = projectDirs()) {
  if (dirs.length === 0 || typeof resolved !== "string") return;
  const file = resolved.replace(/\\/g, "/");
  // Project source never lives under node_modules, and the project directory
  // contains its own node_modules — so this has to be excluded explicitly.
  if (file.includes("/node_modules/")) return;
  if (!dirs.some((dir) => file.startsWith(dir))) return;
  const from = parent && parent.filename ? parent.filename.replace(/\\/g, "/") : "";
  if (!NODE_MODULES_PATH.test(from) || from.includes("/vitest-native/dist/")) return;
  if (reportedProjectLoads.has(file)) return;
  reportedProjectLoads.add(file);
  console.warn(
    `[vitest-native] Node loaded a file from the package under test.\n` +
      `  file      ->  ${resolved}\n` +
      `  required by ->  ${parent.filename}\n` +
      "  The package under test belongs to Vite's graph, so it now exists twice — once\n" +
      "  in each module system — and module-level state is not shared between the copies.\n" +
      "  Nothing throws: writes through one are invisible to the other, so values read back\n" +
      "  unset. This happens when an installed React Native package depends on the very\n" +
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
      "  back unset. Set `resolve.mainFields` so both resolvers agree, or import the package\n" +
      "  from one side only.",
  );
}

/**
 * Compare what Node just resolved against what Vite's field order would pick for
 * the same package. A difference means the two module systems have different
 * files for one package id, so anything importing it from both sides gets two
 * copies with separate state.
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
) {
  if (globalThis.__vitest_native_require_hooks_installed) return;
  globalThis.__vitest_native_require_hooks_installed = true;

  // Asset requires (`require('./logo.png')`, `require('./Icon.ttf')`) reaching
  // Node's CJS loader must be stubbed, not compiled — otherwise the binary falls
  // through to the `.js` handler and throws "SyntaxError: Invalid or unexpected
  // token". RN's packager and Jest's asset transform both stub these (incl.
  // fonts); the Vite graph already does too, so we match it here (module.exports =
  // basename string) for the Node path. (Font-loading libraries like
  // @react-native-vector-icons are shadowed by their preset, so they never inspect
  // the stubbed font require.)
  const NON_ASSET = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx", ".json", ".node"]);
  const assetExtSet = new Set(assetExts.map((e) => String(e).replace(/^\./, "").toLowerCase()));
  for (const raw of assetExts) {
    const ext = "." + String(raw).replace(/^\./, "");
    if (NON_ASSET.has(ext) || Module._extensions[ext]) continue;
    Module._extensions[ext] = function (mod, filename) {
      const basename = filename.replace(/\\/g, "/").split("/").pop() || filename;
      mod.exports = basename;
    };
  }

  // Configured third-party packages to also transform (Flow/TS/JSX stripped).
  const isExtra = buildPkgMatcher(transformPkgs, projectRoot);

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
    } else if (process.env.VITEST_NATIVE_DIAGNOSTICS === "true") {
      console.warn(
        `[vitest-native] '${request}' has no matching export on the '${pkg}' preset mock; serving the root mock namespace.`,
      );
    }
    memo.set(request, exportsValue);
    return exportsValue;
  }

  const origLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    const mocks = globalThis.__vitest_native_preset_mocks;
    if (mocks) {
      if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
      // Subpath require of a preset package — the real deep entry would load the
      // package's native runtime. Exempt: JSON subpaths (package.json version
      // gates), asset subpaths (fonts/images, stubbed from their real files by
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
    }
    return origLoad.call(this, request, parent, ...rest);
  };

  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...rest) {
    if (
      parent &&
      parent.filename &&
      (NODE_MODULES_PATH.test(parent.filename) ||
        REACT_NATIVE_PATH.test(parent.filename) ||
        isExtra(parent.filename)) &&
      request.startsWith(".") &&
      !path.extname(request)
    ) {
      const hit = resolvePlatformFile(
        path.resolve(path.dirname(parent.filename), request),
        platform,
      );
      if (hit) return hit;
    }
    const resolved = origResolve.call(this, request, parent, ...rest);
    checkResolverAgreement(request, resolved);
    checkProjectSourceLoadedByNode(resolved, parent);
    return resolved;
  };

  const origJs = Module._extensions[".js"];
  Module._extensions[".js"] = function (mod, filename) {
    const norm = filename.replace(/\\/g, "/");
    const boundary = boundarySourceFor(norm, platform, reactNativeVersion);
    if (boundary != null) return mod._compile(boundary, filename);
    if (REACT_NATIVE_PATH.test(norm)) {
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
      const src = fs.readFileSync(filename, "utf8");
      return mod._compile(transformRN(filename, src, projectRoot, platform), filename);
    };
  }
}
