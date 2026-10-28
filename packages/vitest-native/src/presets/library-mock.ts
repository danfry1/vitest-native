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

/** The project root in a test worker, where the plugin sets it. */
export function workerRoot(): string {
  return projectContext()?.projectRoot ?? process.cwd();
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
            for (const name of namesIn(path.join(dir, file))) names.add(name);
          }
          if (mock.keepsPresetNames) {
            for (const name of presetNames(fallback, context)) names.add(name);
          }
          return [...names].sort();
        }
      }
      return fallback.exportsFor ? fallback.exportsFor(context) : fallback.exports;
    },
    factory() {
      const root = workerRoot();
      const dir = underNativeEngine() ? libraryMockDir(mock, root) : null;
      if (dir) {
        const loaded = createRequire(path.join(root, "package.json"))(
          `${mock.pkg}/${mock.entry ?? mock.file}`,
        );
        const module = mock.exportKey ? loaded?.[mock.exportKey] : loaded;
        // A mock without the export it is meant to be is no module of it: the preset's.
        if (module === undefined) return fallback.factory();
        const extended = mock.extend ? mock.extend(module, dir) : module;
        return mock.keepsPresetNames ? withPresetNames(extended, fallback) : extended;
      }
      return fallback.factory();
    },
  };
}

function presetNames(
  fallback: PresetModule,
  context: Parameters<NonNullable<PresetModule["exportsFor"]>>[0],
): string[] {
  const names = fallback.exportsFor ? fallback.exportsFor(context) : fallback.exports;
  return Array.isArray(names) ? names : [];
}

/**
 * `module` with the preset's own names it lacks, read from the preset's module when one
 * is first read (it is built once, then). The library's mock object is left as it is.
 */
function withPresetNames(module: unknown, fallback: PresetModule): unknown {
  if (module === null || typeof module !== "object") return module;
  const names = Array.isArray(fallback.exports) ? fallback.exports : [];
  const missing = names.filter((name) => name !== "default" && !(name in module));
  if (missing.length === 0) return module;
  let own: Record<string, unknown> | undefined;
  const merged: Record<string, unknown> = { ...(module as Record<string, unknown>) };
  for (const name of missing) {
    Object.defineProperty(merged, name, {
      enumerable: true,
      configurable: true,
      get: () => (own ??= fallback.factory() as Record<string, unknown>)[name],
    });
  }
  return merged;
}

/** The export names of a further mock file, or none when it is absent or not readable as one. */
function namesIn(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  try {
    return mockModuleExportNames(file);
  } catch {
    return [];
  }
}
