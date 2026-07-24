// Patches Node's CJS loader so RN's internal require() chains are Flow-stripped and
// native-boundary modules are mocked. The companion loader.mjs handles the import() path.
import Module from "node:module";
import path from "node:path";
import fs from "node:fs";
import { transformRN, isFlow } from "./transform.mjs";
import { boundarySourceFor } from "./boundary.mjs";
import { resolvePlatformFile } from "./resolve.mjs";
import { buildPkgMatcher, packageNameOf, subpathLeafOf, isUtilitySubpath } from "./match.mjs";
import { explainUntransformedSyntaxError } from "./explain.mjs";

const RN_PATH = /[\\/]node_modules[\\/](react-native|@react-native)[\\/]/;
// Any file under a node_modules directory. Platform-extension resolution
// (`.native.js` etc.) applies to every node_modules package, not just RN — matching
// Metro, which resolves platform variants project-wide. See loader.mjs for the
// ESM-path counterpart and the @react-navigation silent-failure this prevents.
const NODE_MODULES = /[\\/]node_modules[\\/]/;

// Guarded via globalThis, not module scope: under the hot runtime this module
// can be evaluated twice in one worker (once by the worker entry through Node's
// loader, once through Vitest's module runner when the setup file is inlined),
// and the hooks must still install exactly once per worker.
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
      (NODE_MODULES.test(parent.filename) ||
        RN_PATH.test(parent.filename) ||
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
    return origResolve.call(this, request, parent, ...rest);
  };

  const origJs = Module._extensions[".js"];
  Module._extensions[".js"] = function (mod, filename) {
    const norm = filename.replace(/\\/g, "/");
    const boundary = boundarySourceFor(norm, platform, reactNativeVersion);
    if (boundary != null) return mod._compile(boundary, filename);
    if (RN_PATH.test(norm)) {
      const src = fs.readFileSync(filename, "utf8");
      if (isFlow(src))
        return mod._compile(transformRN(filename, src, projectRoot, platform), filename);
    } else if (isExtra(norm)) {
      // Configured third-party packages: transform unconditionally — TS `import
      // type`/JSX aren't caught by isFlow, and babel passes plain JS through.
      const src = fs.readFileSync(filename, "utf8");
      return mod._compile(transformRN(filename, src, projectRoot, platform), filename);
    }
    if (NODE_MODULES.test(norm)) {
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
