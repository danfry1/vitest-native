import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { PresetModule } from "../types.js";
import { mockModuleExportNames } from "./esm-export-names.js";

// A preset module that is the library's own test mock under the native engine.
//
// Libraries publish a mock for Jest suites to install with
// `jest.mock(pkg, () => require('<pkg>/<mock>'))` (react-native-reanimated/mock,
// react-native-worklets' lib/module/mock.js, react-native-safe-area-context/jest/mock).
// Under the native engine the preset's module is that mock, loaded as Node loads any
// module, so it runs with the library's own test support around it
// (native/library-jest.mjs gives its files Jest's `jest`), and its named exports are
// read from the installed file. Where the native engine cannot run it (the library
// predates its mock, or its prerequisites), and under the mock engine, which has no
// real React Native for a mock that loads the real package, the preset's own module
// serves.

export interface LibraryMock {
  /** The package the preset shadows. */
  pkg: string;
  /** The mock's path inside the package, as `require` takes it ("mock", "jest/mock"). */
  entry: string;
  /** Its built file inside the package, which its export names are read from. */
  file: string;
  /** Further files whose names the mock module also provides (reanimated's mock-svg). */
  alsoFiles?: string[];
  /** The export the mock module is, when it is not the whole module ("default"). */
  exportKey?: string;
  /** Whether the installed package can run its mock here; by default, whether `file` exists. */
  available?: (packageDir: string, projectRoot: string) => boolean;
}

/** Whether this test run is under the native engine (its setup installs the control). */
function underNativeEngine(): boolean {
  return (
    (globalThis as { __vitest_native_control?: { engine?: string } }).__vitest_native_control
      ?.engine === "native"
  );
}

/** The project root in a test worker, where the plugin sets it. */
function workerRoot(): string {
  return process.env.VITEST_NATIVE_PROJECT_ROOT || process.cwd();
}

/** The installed package's directory, from `root`, or null. */
function packageDir(pkg: string, root: string): string | null {
  // On disk, up the node_modules directories: through require(), a preset's require()
  // bridge in a mock-engine worker answers for the package.
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", pkg);
    if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
    if (path.dirname(dir) === dir) return null;
  }
}

function usable(mock: LibraryMock, root: string): string | null {
  const dir = packageDir(mock.pkg, root);
  if (!dir) return null;
  const available = mock.available ?? ((d: string) => fs.existsSync(path.join(d, mock.file)));
  return available(dir, root) ? dir : null;
}

/**
 * `fallback`, except under the native engine where the library's own mock can run:
 * there the module is the mock, with the mock's export names.
 */
export function libraryMockModule(mock: LibraryMock, fallback: PresetModule): PresetModule {
  return {
    exports: fallback.exports,
    exportsFor(context) {
      if (context.engine === "native") {
        const dir = usable(mock, context.projectRoot);
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
      const root = workerRoot();
      if (underNativeEngine() && usable(mock, root)) {
        const loaded = createRequire(path.join(root, "package.json"))(`${mock.pkg}/${mock.entry}`);
        return mock.exportKey ? loaded[mock.exportKey] : loaded;
      }
      return fallback.factory();
    },
  };
}
