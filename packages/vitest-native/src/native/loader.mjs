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
// Any file living under a node_modules directory. Platform-extension resolution
// (`.native.js` etc.) applies to every node_modules package, not just RN, matching
// Metro — which resolves platform variants project-wide. (Without this, e.g.
// `@react-navigation/native` silently loads its `.js`/web variant instead of
// `.native.js`, breaking the navigation lifecycle with no error.)
const NODE_MODULES = /[\\/]node_modules[\\/]/;
// React Native's main entry (`react-native/index.js`).
const RN_INDEX = /[\\/]react-native[\\/]index\.js$/;
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
let PLATFORM = "ios";
let REACT_NATIVE_VERSION = "0.0.0";
let isExtra = () => false;
// Preset package name → its mock's named-export list (from the preset definition).
let presetExports = {};
// Asset file extensions (without leading dot, lower-cased) the loader should stub.
let assetExtSet = new Set();

export async function initialize(data) {
  if (data && data.projectRoot) PROJECT_ROOT = data.projectRoot;
  if (data && data.platform === "android") PLATFORM = "android";
  if (data && data.reactNativeVersion) REACT_NATIVE_VERSION = data.reactNativeVersion;
  if (data && data.transformPkgs) isExtra = buildPkgMatcher(data.transformPkgs);
  if (data && data.presetExports) presetExports = data.presetExports;
  if (data && data.assetExts)
    assetExtSet = new Set(data.assetExts.map((e) => String(e).replace(/^\./, "").toLowerCase()));
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
  if (
    parent &&
    (NODE_MODULES.test(parent) || RN_PATH.test(parent) || isExtra(parent)) &&
    specifier.startsWith(".") &&
    !path.extname(specifier)
  ) {
    const hit = resolvePlatformFile(path.resolve(path.dirname(parent), specifier), PLATFORM);
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }

  let resolved;
  try {
    resolved = await nextResolve(specifier, context);
  } catch (err) {
    // Fallback: an extensionless relative import that Node's ESM resolver rejected
    // but a bundler (Metro) would accept. Common in externalized RN libs shipping
    // ESM with extensionless imports. Resolve it on disk ourselves.
    if (parent && specifier.startsWith(".") && !path.extname(specifier)) {
      const hit = resolveExtensionless(path.resolve(path.dirname(parent), specifier));
      if (hit) resolved = { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    if (!resolved) throw err;
  }

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
  return resolved;
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
      // Honor a factory-provided default (e.g. svg's default Svg component);
      // only fall back to the namespace object when the mock has none.
      `export default ("default" in _m ? _m["default"] : _m);`,
    ].join("\n");
    return { format: "module", source, shortCircuit: true };
  }

  if (!url.startsWith("file:")) return nextLoad(url, context);
  const file = fileURLToPath(url);
  const norm = file.replace(/\\/g, "/");

  // Asset imports (`import logo from './logo.png'`, `import font from './Icon.ttf'`)
  // from ANY package: Node's ESM loader can't parse a binary asset as a module and
  // throws. Stub to the basename string — matching the CJS require hook (hooks.mjs)
  // and the Vite graph. Applies regardless of whether the importing package is RN
  // or in `transform`, since assets are pulled in by ecosystem libs too (e.g.
  // `@react-navigation/elements`' back-icon.png).
  const ext = path.extname(norm).slice(1).toLowerCase();
  if (ext && assetExtSet.has(ext)) {
    const basename = norm.split("/").pop() || norm;
    return {
      format: "module",
      source: `export default ${JSON.stringify(basename)};`,
      shortCircuit: true,
    };
  }

  const isRN = RN_PATH.test(norm);
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
    if (RN_INDEX.test(norm)) {
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
    const boundary = boundarySourceFor(norm, PLATFORM, REACT_NATIVE_VERSION);
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

  // Configured third-party package: transform any JS/TS/JSX source to CJS.
  if (TRANSFORMABLE.test(norm)) {
    const src = fs.readFileSync(file, "utf8");
    return {
      format: "commonjs",
      source: transformRN(file, src, PROJECT_ROOT, PLATFORM),
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
