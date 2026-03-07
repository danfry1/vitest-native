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

    // 2. Patch _resolveFilename to redirect react-native requires
    originalResolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (
      request: string,
      parent: any,
      isMain: boolean,
      options: any,
    ) {
      // Root react-native import — serve our full mock.
      if (request === "react-native") {
        return VIRTUAL_RN_PATH;
      }
      // Subpath imports (react-native/Libraries/*, react-native/jest-preset, etc.)
      // — also redirect to our mock. CJS consumers typically destructure what
      // they need, and the root mock contains all public exports.
      if (request.startsWith("react-native/")) {
        return VIRTUAL_RN_PATH;
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

    // Extend the existing _resolveFilename patch (it's already installed by installCjsBridge)
    const currentResolve = Module._resolveFilename;
    Module._resolveFilename = function (
      request: string,
      parent: any,
      isMain: boolean,
      options: any,
    ) {
      if (request === moduleName || request.startsWith(`${moduleName}/`)) {
        return virtualPath;
      }
      return currentResolve.call(this, request, parent, isMain, options);
    };
  } catch (e) {
    if (process.env.VITEST_NATIVE_DIAGNOSTICS === "true") {
      console.warn(
        `[vitest-native] Preset CJS bridge for ${moduleName} failed: ${(e as Error)?.message}`,
      );
    }
  }
}
