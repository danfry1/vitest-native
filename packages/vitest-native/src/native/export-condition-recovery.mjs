// Recovery for packages whose `react-native` export target was never published.
//
// Vitest forwards the project's ssr resolve conditions to each worker as Node
// `--conditions` flags (resolveConditions in Vitest 4 and 5), and both engines put
// `react-native` there, because Node-owned React Native packages must load their
// native build. The flag is process-wide, so it also applies to what Vitest itself
// loads in the worker before any test runs: the test environment. Jest loads its
// environment outside the conditioned module registry; Vitest cannot.
//
// That is harmless until a package's export map names a `react-native` target it does
// not ship. lru-cache 11.5.3 (2026-09-18; earlier releases have no `react-native`
// condition) maps `require` + `react-native` to dist/commonjs/react-native/index.min.js
// and publishes no such file; jsdom depends on lru-cache ^11.3.5, so a fresh install
// gets it and `environment: 'jsdom'` failed to start any worker ("Cannot find module
// …/lru-cache/dist/commonjs/react-native/index.min.js").
//
// The preload (export-condition-recovery-preload.mjs, `--import`ed from
// `test.execArgv`, which Vitest appends after the forwarded conditions) acts only on
// that failure: a bare request whose package export, chosen under the `react-native`
// condition, names a file that does not exist.
// It resolves the same export with the process's other conditions, as Node would
// without `react-native`, and uses that file if it exists. Every other resolution,
// successful or not, is left exactly as Node decided it.
//
// CommonJS `require` only, which is how Vitest loads jsdom. An ESM `import` under the
// same condition is resolved by Node's ESM loader and is not recovered here.
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { exportTarget } from "./shared-resolver.mjs";

const RN = "react-native";

/**
 * The CommonJS conditions Node matches for this process, without `react-native`.
 * Node's documented set: `require`, `node`, `node-addons`, `module-sync` where
 * require(esm) is enabled, the `--conditions` / `-C` flags, and `default`.
 */
export function cjsConditionsWithout(
  excluded,
  execArgv = process.execArgv,
  features = process.features,
) {
  const conditions = ["require", "node", "node-addons"];
  if (features?.require_module) conditions.push("module-sync");
  const options = [...execArgv, ...(process.env.NODE_OPTIONS ?? "").split(/\s+/).filter(Boolean)];
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    let value;
    if (option === "--conditions" || option === "-C") value = options[++i];
    else if (option.startsWith("--conditions=")) value = option.slice("--conditions=".length);
    else if (option.startsWith("-C=")) value = option.slice(3);
    if (value && value !== excluded && !conditions.includes(value)) conditions.push(value);
  }
  return conditions;
}

function packageName(request) {
  if (request.startsWith(".") || path.isAbsolute(request) || request.startsWith("node:")) {
    return null;
  }
  const parts = request.split("/");
  return request.startsWith("@") ? (parts.length > 1 ? `${parts[0]}/${parts[1]}` : null) : parts[0];
}

/**
 * The file to use instead, when `error` is Node failing on a missing `react-native`
 * export target for `request`, or null to let the error stand.
 */
export function recoverMissingReactNativeTarget(
  request,
  error,
  conditions,
  fileExists = fs.existsSync,
) {
  if (error?.code !== "MODULE_NOT_FOUND" || typeof error.path !== "string") return null;
  const name = packageName(request);
  if (name === null) return null;
  // Node reports the package directory (measured on 22.22 and 24).
  const packageDir = error.path;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
  } catch {
    return null;
  }
  if (manifest.name !== name || manifest.exports === undefined) return null;
  const subpath = `.${request.slice(name.length)}`;
  // Only the failure this exists for: the target Node chose, with react-native in
  // play, is not on disk.
  const withRn = exportTarget(manifest.exports, subpath, [RN, ...conditions]);
  if (withRn === null || fileExists(path.join(packageDir, withRn))) return null;
  const without = exportTarget(manifest.exports, subpath, conditions);
  if (without === null || without === withRn) return null;
  const file = path.join(packageDir, without);
  return fileExists(file) ? file : null;
}

const INSTALLED = Symbol.for("vitest-native.export-condition-recovery");

export function installExportConditionRecovery() {
  // Marked on the process, not the function: later patches of _resolveFilename
  // (native/hooks.mjs, module-reset.mjs) wrap this one.
  if (globalThis[INSTALLED]) return;
  globalThis[INSTALLED] = true;
  const conditions = cjsConditionsWithout(RN);
  const original = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...rest) {
    try {
      return original.call(this, request, parent, ...rest);
    } catch (error) {
      const file = recoverMissingReactNativeTarget(request, error, conditions);
      if (file === null) throw error;
      return file;
    }
  };
}
