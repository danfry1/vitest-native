import { createRequire } from "node:module";
import path from "node:path";
import type { PresetModule } from "../types.js";
import { mockModuleExportNames } from "./esm-export-names.js";
import { projectContext } from "../context.mjs";
import { BUILT_AT_SETUP, libraryMockDir, type LibraryMock } from "../preset-map.js";

// A preset module that is the library's own test mock under the native engine.
//
// Libraries publish a mock for Jest suites to install with
// `jest.mock(pkg, () => require('<pkg>/<mock>'))` (react-native-worklets'
// lib/module/mock.js). Under the native engine the preset's module is that mock,
// served from the library registry (native/registry.mjs, buildLibraryRegistry) as
// the mock's own require of it, and its named exports are read from the installed
// file. Under the mock engine, which has no real React Native, and where the library
// predates its mock, the preset's own module serves.

/** Whether this test run is under the native engine (its setup installs the control). */
function underNativeEngine(): boolean {
  return (
    (globalThis as { __vitest_native_control?: { engine?: string } }).__vitest_native_control
      ?.engine === "native"
  );
}

/**
 * `fallback`, except under the native engine where the library's own mock can run:
 * there the module is the mock, with the mock's export names.
 */
export function libraryMockModule(mock: LibraryMock, fallback: PresetModule): PresetModule {
  return {
    ...(mock.setsGlobals ? { [BUILT_AT_SETUP]: true } : {}),
    exports: fallback.exports,
    exportsFor(context) {
      if (context.engine === "native") {
        const dir = libraryMockDir(mock, context.projectRoot);
        if (dir) return mockModuleExportNames(path.join(dir, mock.file));
      }
      return fallback.exportsFor ? fallback.exportsFor(context) : fallback.exports;
    },
    factory() {
      const root = projectContext()?.projectRoot ?? process.cwd();
      if (underNativeEngine() && libraryMockDir(mock, root)) {
        return createRequire(path.join(root, "package.json"))(`${mock.pkg}/${mock.file}`);
      }
      return fallback.factory();
    },
  };
}
