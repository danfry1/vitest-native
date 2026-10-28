import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { PresetModule } from "../types.js";
import { mockModuleExportNames } from "./esm-export-names.js";
import { projectContext } from "../context.mjs";
import { BUILT_AT_SETUP, libraryMockDir, type LibraryMock } from "../preset-map.js";

export type { LibraryMock } from "../preset-map.js";

// A preset module that is the library's own test mock under the native engine.
//
// Libraries publish a mock for Jest suites to install with
// `jest.mock(pkg, () => require('<pkg>/<mock>'))` (react-native-reanimated/mock,
// react-native-worklets' lib/module/mock.js, react-native-safe-area-context/jest/mock).
// Under the native engine the preset's module is that mock, required as a Jest suite
// requires it: from the library registry when the mock is one of its entries
// (native/registry.mjs, buildLibraryRegistry), else as Node loads any module, with the
// library's own test support around it (native/library-jest.mjs gives its files Jest's
// `jest`). Its named exports are read from the installed files. Under the mock engine,
// which has no real React Native, and where the library cannot run its mock, the
// preset's own module serves.

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
        if (dir) {
          const names = new Set(mockModuleExportNames(path.join(dir, mock.file)));
          for (const file of mock.alsoFiles ?? []) {
            const full = path.join(dir, file);
            if (fs.existsSync(full))
              for (const name of mockModuleExportNames(full)) names.add(name);
          }
          return [...names].sort();
        }
      }
      return fallback.exportsFor ? fallback.exportsFor(context) : fallback.exports;
    },
    factory() {
      const root = projectContext()?.projectRoot ?? process.cwd();
      if (underNativeEngine() && libraryMockDir(mock, root)) {
        const loaded = createRequire(path.join(root, "package.json"))(
          `${mock.pkg}/${mock.entry ?? mock.file}`,
        );
        return mock.exportKey ? loaded[mock.exportKey] : loaded;
      }
      return fallback.factory();
    },
  };
}
