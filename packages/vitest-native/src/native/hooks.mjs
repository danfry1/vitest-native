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
export function installRequireHooks(projectRoot, transformPkgs = []) {
  if (installed) return;
  installed = true;

  // Configured third-party packages to also transform (Flow/TS/JSX stripped).
  const isExtra = buildPkgMatcher(transformPkgs);

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
}
