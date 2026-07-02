/**
 * CJS Bridge — intercepts Node's require('react-native') so CJS consumers
 * (like @testing-library/react-native) resolve to our mocks instead of
 * the real Flow-typed source.
 *
 * Unlike v1, this uses Module._cache injection (no /tmp files) and stores
 * the original _resolveFilename for clean teardown.
 *
 * Safety: This mutates global Module state (Module._resolveFilename and
 * Module._cache). This is necessary because CJS require() has no plugin
 * system — interception is the only option. All mutations are tracked and
 * fully reversed by uninstallCjsBridge() which runs in afterAll().
 * Each vitest worker process gets its own Module state, so there's no
 * cross-test contamination in parallel runs.
 */

const VIRTUAL_RN_PATH = "\0vitest-native:react-native";

let originalResolveFilename: Function | null = null;
let installed = false;
// The mock object handed to installCjsBridge — consulted for leaf-aware
// subpath resolution (react-native/Libraries/Utilities/Platform → mock.Platform).
let rnMock: Record<string, any> | null = null;

// Single lookup table for all preset module redirections.
// Maps exact module names to their virtual paths. Avoids wrapping
// _resolveFilename in a new closure per preset (O(n) chain → O(1) Map).
const presetRedirects = new Map<string, string>();
// The live mock objects behind presetRedirects, for leaf-aware subpath lookups.
const presetMocks = new Map<string, Record<string, any>>();
// Synthetic leaf modules created on demand for subpath requires; tracked so
// uninstallCjsBridge can remove them from Module._cache.
const leafModulePaths = new Set<string>();

/**
 * The leaf module name a subpath require points at ("pkg/lib/Swipeable" or
 * ".../Platform.ios.js" → "Platform"). Mirrors native/match.mjs.
 */
function subpathLeafOf(request: string): string | null {
  const base = request.split("/").pop();
  if (!base) return null;
  return base.split(".")[0] || null;
}

/**
 * Wrap a leaf export in Babel-CJS interop shape: the real compiled deep entry
 * exports `{ __esModule: true, default: X }`. A live Proxy keeps
 * direct-property consumers (`require('pkg/Sub').OS`) working too.
 */
function withDefaultInterop(value: any): any {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return { __esModule: true, default: value };
  }
  return new Proxy(value, {
    get: (t, p, r) => (p === "default" ? t : p === "__esModule" ? true : Reflect.get(t, p, r)),
    has: (t, p) => p === "default" || p === "__esModule" || Reflect.has(t, p),
  });
}

/**
 * Get or create a synthetic Module._cache entry for a subpath require whose
 * leaf name matches an export on the mock. Returns its virtual path, or null
 * when the leaf has no matching export (caller falls back to the root mock).
 */
function leafModulePath(
  Module: any,
  keyPrefix: string,
  mock: Record<string, any>,
  request: string,
): string | null {
  const leaf = subpathLeafOf(request);
  if (!leaf || !Object.prototype.hasOwnProperty.call(mock, leaf)) return null;
  const virtualPath = `${keyPrefix}:${leaf}`;
  if (!Module._cache[virtualPath]) {
    const syntheticModule = new Module(virtualPath);
    syntheticModule.id = virtualPath;
    syntheticModule.filename = virtualPath;
    syntheticModule.loaded = true;
    syntheticModule.exports = withDefaultInterop(mock[leaf]);
    Module._cache[virtualPath] = syntheticModule;
    leafModulePaths.add(virtualPath);
  }
  return virtualPath;
}

export function installCjsBridge(mockObject: Record<string, any>): void {
  if (installed) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require("node:module");

    // 1. Create a synthetic module and inject into Module._cache
    const syntheticModule = new Module(VIRTUAL_RN_PATH);
    syntheticModule.id = VIRTUAL_RN_PATH;
    syntheticModule.filename = VIRTUAL_RN_PATH;
    syntheticModule.loaded = true;
    syntheticModule.exports = mockObject;
    Module._cache[VIRTUAL_RN_PATH] = syntheticModule;

    rnMock = mockObject;

    // 2. Patch _resolveFilename once — handles react-native and all presets
    originalResolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (
      request: string,
      parent: any,
      isMain: boolean,
      options: any,
    ) {
      // Root react-native import or subpath (react-native/Libraries/*, etc.).
      // The package manifest is exempt: `require('react-native/package.json')
      // .version` is a common version gate and must read the real file. Subpaths
      // whose leaf matches a mock export (…/Utilities/Platform → mock.Platform)
      // get a per-leaf module so the require yields Platform, not the whole mock.
      if (request === "react-native" || request.startsWith("react-native/")) {
        if (request === "react-native/package.json") {
          try {
            return (originalResolveFilename as Function).call(
              this,
              request,
              parent,
              isMain,
              options,
            );
          } catch {
            // RN not installed (mock engine works without it) — keep the mock.
          }
        } else if (request !== "react-native" && rnMock) {
          const leafPath = leafModulePath(Module, VIRTUAL_RN_PATH, rnMock, request);
          if (leafPath) return leafPath;
        }
        return VIRTUAL_RN_PATH;
      }

      // Preset modules — O(1) exact match, then check for subpath imports
      const exactMatch = presetRedirects.get(request);
      if (exactMatch) return exactMatch;

      // Subpath imports (e.g. @react-navigation/native/lib/...) — find the
      // longest matching prefix. Since preset names contain slashes (scoped
      // packages), we check if any registered preset is a prefix. JSON subpaths
      // (package.json version gates) pass through to the real inert file; leaf
      // matches get a per-leaf module (see the react-native branch above).
      // Unlike the native-engine hooks, asset and utility subpaths are NOT
      // passed through here: this CJS path has no asset-extension handlers and
      // no Flow/TS transform, so the real file would throw — the root-mock
      // fallback (long-standing behavior) is the lenient option.
      const slashIdx = request.indexOf("/", request.startsWith("@") ? request.indexOf("/") + 1 : 0);
      if (slashIdx !== -1) {
        const pkg = request.slice(0, slashIdx);
        const subpathMatch = presetRedirects.get(pkg);
        if (subpathMatch) {
          if (request.endsWith(".json")) {
            try {
              return (originalResolveFilename as Function).call(
                this,
                request,
                parent,
                isMain,
                options,
              );
            } catch {
              // Package not on disk — fall back to the root mock.
            }
          } else {
            const mock = presetMocks.get(pkg);
            const leafPath = mock && leafModulePath(Module, subpathMatch, mock, request);
            if (leafPath) return leafPath;
          }
          return subpathMatch;
        }
      }

      return (originalResolveFilename as Function).call(this, request, parent, isMain, options);
    };

    installed = true;
  } catch (e) {
    if (process.env.VITEST_NATIVE_DIAGNOSTICS === "true") {
      console.warn(`[vitest-native] CJS bridge install failed: ${(e as Error)?.message}`);
    }
  }
}

export function uninstallCjsBridge(): void {
  if (!installed) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require("node:module");

    // Restore original _resolveFilename
    if (originalResolveFilename) {
      Module._resolveFilename = originalResolveFilename;
      originalResolveFilename = null;
    }

    // Remove synthetic module from cache
    delete Module._cache[VIRTUAL_RN_PATH];

    // Remove all preset synthetic modules
    for (const virtualPath of presetRedirects.values()) {
      delete Module._cache[virtualPath];
    }
    presetRedirects.clear();
    presetMocks.clear();

    // Remove per-leaf subpath modules created on demand
    for (const virtualPath of leafModulePaths) {
      delete Module._cache[virtualPath];
    }
    leafModulePaths.clear();
    rnMock = null;

    installed = false;
  } catch (e) {
    if (process.env.VITEST_NATIVE_DIAGNOSTICS === "true") {
      console.warn(`[vitest-native] CJS bridge uninstall failed: ${(e as Error)?.message}`);
    }
  }
}

export function installPresetCjsBridge(moduleName: string, mockObject: Record<string, any>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require("node:module");

    const virtualPath = `\0vitest-native:preset:${moduleName}`;
    const syntheticModule = new Module(virtualPath);
    syntheticModule.id = virtualPath;
    syntheticModule.filename = virtualPath;
    syntheticModule.loaded = true;
    syntheticModule.exports = mockObject;
    Module._cache[virtualPath] = syntheticModule;

    // Register in the flat lookup table — no _resolveFilename wrapping needed.
    presetRedirects.set(moduleName, virtualPath);
    presetMocks.set(moduleName, mockObject);
  } catch (e) {
    if (process.env.VITEST_NATIVE_DIAGNOSTICS === "true") {
      console.warn(
        `[vitest-native] Preset CJS bridge for ${moduleName} failed: ${(e as Error)?.message}`,
      );
    }
  }
}
