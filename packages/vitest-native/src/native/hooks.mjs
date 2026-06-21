// Patches Node's CJS loader so RN's internal require() chains are Flow-stripped and
// native-boundary modules are mocked. The companion loader.mjs handles the import() path.
import Module from "node:module";
import path from "node:path";
import fs from "node:fs";
import { transformRN, isFlow } from "./transform.mjs";
import { boundarySourceFor } from "./boundary.mjs";
import { resolvePlatformFile } from "./resolve.mjs";
import { buildPkgMatcher } from "./match.mjs";

const RN_PATH = /[\\/](react-native|@react-native)[\\/]/;
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
  for (const raw of assetExts) {
    const ext = "." + String(raw).replace(/^\./, "");
    if (NON_ASSET.has(ext) || Module._extensions[ext]) continue;
    Module._extensions[ext] = function (mod, filename) {
      const basename = filename.replace(/\\/g, "/").split("/").pop() || filename;
      mod.exports = basename;
    };
  }

  // Configured third-party packages to also transform (Flow/TS/JSX stripped).
  const isExtra = buildPkgMatcher(transformPkgs);

  // Preset redirect (CJS): when an externalized third-party module require()s a
  // preset package by its bare name (e.g. @gorhom/bottom-sheet → require(
  // 'react-native-gesture-handler'), or moti → require('react-native-reanimated')),
  // serve the runtime preset mock instead of loading the real native lib. The Vite
  // plugin already redirects the app/test graph's *direct* imports; this closes the
  // gap for nested requires that reach Node's CJS loader and would otherwise hit
  // the real package's native runtime. The lookup is dynamic (no preset-name list
  // captured at install time) so the hooks can install at hot-worker boot, before
  // the setup file has built the preset mocks.
  const origLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    const mocks = globalThis.__vitest_native_preset_mocks;
    if (mocks && Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
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
      const src = fs.readFileSync(filename, "utf8");
      return mod._compile(transformRN(filename, src, projectRoot, platform), filename);
    };
  }
}
