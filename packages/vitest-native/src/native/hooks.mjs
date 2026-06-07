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

let installed = false;
export function installRequireHooks(projectRoot, transformPkgs = [], presetPkgs = []) {
  if (installed) return;
  installed = true;

  // Configured third-party packages to also transform (Flow/TS/JSX stripped).
  const isExtra = buildPkgMatcher(transformPkgs);

  // Preset redirect (CJS): when an externalized third-party module require()s a
  // preset package by its bare name (e.g. @gorhom/bottom-sheet → require(
  // 'react-native-gesture-handler'), or moti → require('react-native-reanimated')),
  // serve the runtime preset mock instead of loading the real native lib. The Vite
  // plugin already redirects the app/test graph's *direct* imports; this closes the
  // gap for nested requires that reach Node's CJS loader and would otherwise hit
  // the real package's native runtime.
  const presetSet = new Set(presetPkgs);
  if (presetSet.size > 0) {
    const origLoad = Module._load;
    Module._load = function (request, parent, ...rest) {
      if (presetSet.has(request)) {
        const mocks = globalThis.__vitest_native_preset_mocks;
        if (mocks && mocks[request]) return mocks[request];
      }
      return origLoad.call(this, request, parent, ...rest);
    };
  }

  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...rest) {
    if (
      parent &&
      parent.filename &&
      RN_PATH.test(parent.filename) &&
      request.startsWith(".") &&
      !path.extname(request)
    ) {
      const hit = resolvePlatformFile(path.resolve(path.dirname(parent.filename), request));
      if (hit) return hit;
    }
    return origResolve.call(this, request, parent, ...rest);
  };

  const origJs = Module._extensions[".js"];
  Module._extensions[".js"] = function (mod, filename) {
    const norm = filename.replace(/\\/g, "/");
    const boundary = boundarySourceFor(norm);
    if (boundary != null) return mod._compile(boundary, filename);
    if (RN_PATH.test(norm)) {
      const src = fs.readFileSync(filename, "utf8");
      if (isFlow(src)) return mod._compile(transformRN(filename, src, projectRoot), filename);
    } else if (isExtra(norm)) {
      // Configured third-party packages: transform unconditionally — TS `import
      // type`/JSX aren't caught by isFlow, and babel passes plain JS through.
      const src = fs.readFileSync(filename, "utf8");
      return mod._compile(transformRN(filename, src, projectRoot), filename);
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
      return mod._compile(transformRN(filename, src, projectRoot), filename);
    };
  }
}
