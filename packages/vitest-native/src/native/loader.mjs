// Node ESM loader hook (registered via module.register). Intercepts import() of RN —
// which Module._extensions cannot — Flow-stripping and serving boundary mock source.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { transformRN, isFlow } from "./transform.mjs";
import { boundarySourceFor } from "./boundary.mjs";
import { resolvePlatformFile } from "./resolve.mjs";
import { buildPkgMatcher } from "./match.mjs";

const RN_PATH = /[\\/](react-native|@react-native)[\\/]/;
const TRANSFORMABLE = /\.(jsx?|tsx?|mjs|cjs)$/;
// Extensions/index candidates for bundler-style extensionless resolution.
const RESOLVE_EXTS = [".js", ".cjs", ".mjs", ".json", ".jsx", ".ts", ".tsx"];

/**
 * Bundler-style resolution for an extensionless relative import: try `base+ext`
 * then `base/index+ext`. Metro/webpack accept these; Node's strict ESM resolver
 * doesn't, which breaks externalized libs that ship ESM with extensionless imports
 * (e.g. @expo/vector-icons' `import './createIconSet'`, react-native-webview's
 * `./WebView`). Returns the on-disk path, or null.
 */
function resolveExtensionless(base) {
  for (const ext of RESOLVE_EXTS) {
    const f = base + ext;
    if (fs.existsSync(f)) return f;
  }
  for (const ext of RESOLVE_EXTS) {
    const f = path.join(base, "index" + ext);
    if (fs.existsSync(f)) return f;
  }
  return null;
}
// Synthetic URL scheme for preset mocks served to the ESM graph (see below).
const PRESET_SCHEME = "vitest-native-preset:";
let PROJECT_ROOT = process.cwd();
let isExtra = () => false;
// Preset package name → its mock's named-export list (from the preset definition).
let presetExports = {};

export async function initialize(data) {
  if (data && data.projectRoot) PROJECT_ROOT = data.projectRoot;
  if (data && data.transformPkgs) isExtra = buildPkgMatcher(data.transformPkgs);
  if (data && data.presetExports) presetExports = data.presetExports;
}

export async function resolve(specifier, context, nextResolve) {
  // Preset redirect (ESM): a bare import of a preset package — whether from the
  // test graph or, crucially, nested inside an externalized third-party lib — is
  // redirected to a synthetic module that re-exports the runtime preset mock. This
  // mirrors the Vite plugin's virtual:preset modules for the Node ESM path.
  if (Object.prototype.hasOwnProperty.call(presetExports, specifier)) {
    return { url: PRESET_SCHEME + specifier, shortCircuit: true };
  }

  const parent =
    context.parentURL && context.parentURL.startsWith("file:")
      ? fileURLToPath(context.parentURL)
      : null;
  if (parent && RN_PATH.test(parent) && specifier.startsWith(".") && !path.extname(specifier)) {
    const hit = resolvePlatformFile(path.resolve(path.dirname(parent), specifier));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Fallback: an extensionless relative import that Node's ESM resolver rejected
    // but a bundler (Metro) would accept. Common in externalized RN libs shipping
    // ESM with extensionless imports. Resolve it on disk ourselves.
    if (parent && specifier.startsWith(".") && !path.extname(specifier)) {
      const hit = resolveExtensionless(path.resolve(path.dirname(parent), specifier));
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  // Serve the synthetic preset module. The generated source reads the mock built
  // by the native setup file from globalThis (this source executes in the main
  // realm, so globalThis is the populated one), mirroring the Vite virtual:preset.
  if (url.startsWith(PRESET_SCHEME)) {
    const pkg = url.slice(PRESET_SCHEME.length);
    const names = presetExports[pkg] || [];
    const source = [
      `const _m = (globalThis.__vitest_native_preset_mocks || {})[${JSON.stringify(pkg)}] || {};`,
      ...names.map((n) => `export const ${n} = _m[${JSON.stringify(n)}];`),
      `export default _m;`,
    ].join("\n");
    return { format: "module", source, shortCircuit: true };
  }

  if (!url.startsWith("file:")) return nextLoad(url, context);
  const file = fileURLToPath(url);
  const norm = file.replace(/\\/g, "/");
  const isRN = RN_PATH.test(norm);
  if (!isRN && !isExtra(norm)) return nextLoad(url, context);

  if (isRN) {
    const boundary = boundarySourceFor(norm);
    if (boundary != null) return { format: "commonjs", source: boundary, shortCircuit: true };
    if (norm.endsWith(".js")) {
      const src = fs.readFileSync(file, "utf8");
      if (isFlow(src))
        return {
          format: "commonjs",
          source: transformRN(file, src, PROJECT_ROOT),
          shortCircuit: true,
        };
    }
    return nextLoad(url, context);
  }

  // Configured third-party package: transform any JS/TS/JSX source to CJS.
  if (TRANSFORMABLE.test(norm)) {
    const src = fs.readFileSync(file, "utf8");
    return { format: "commonjs", source: transformRN(file, src, PROJECT_ROOT), shortCircuit: true };
  }
  return nextLoad(url, context);
}
