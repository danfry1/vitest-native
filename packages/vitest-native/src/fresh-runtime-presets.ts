import { libraryMockDir } from "./preset-map.js";
import type { LibraryMock } from "./presets/library-mock.js";
import { KEYBOARD_CONTROLLER_MOCK } from "./presets/keyboard-controller.js";
import { SAFE_AREA_MOCK } from "./presets/safe-area.js";

/**
 * The presets whose module, as served, uses React through vitest-native's own dist (a
 * module-scope `import React`). The hot runtime keeps that dist resident, so under
 * `hotRuntime.freshRuntime`, where React is evaluated again for each file, these modules
 * keep the first file's React, and later files fail with "Invalid hook call" or read a
 * default (#719). While one is active, freshRuntime declines and React stays resident.
 *
 * reanimated corrects even the library's own mock with React-using helpers, and
 * bottomSheet serves the names the library's mock lacks from its built-in module, so
 * both count whichever module they serve.
 *
 * Temporary: removed when the preset factories take React from the file's own require.
 */
const HOLD_REACT = new Set([
  "bottomSheet",
  "expo",
  "flashList",
  "gestureHandler",
  "keyboardController",
  "mmkv",
  "navigation",
  "reanimated",
  "safeAreaContext",
  "screens",
  "svg",
  "unistyles",
  "vectorIcons",
  "webview",
]);

/** Presets that serve the library's own Jest mock, which does not use the preset's React, when it is installed. */
const NOT_WITH_OWN_MOCK: Record<string, LibraryMock> = {
  safeAreaContext: SAFE_AREA_MOCK,
  keyboardController: KEYBOARD_CONTROLLER_MOCK,
};

/** The active presets, by name, whose served module holds React per worker. */
export function presetsHoldingReact(presetNames: readonly string[], projectRoot: string): string[] {
  return presetNames.filter((name) => {
    if (!HOLD_REACT.has(name)) return false;
    const mock = NOT_WITH_OWN_MOCK[name];
    return mock === undefined || libraryMockDir(mock, projectRoot) === null;
  });
}

/** The one line printed when freshRuntime declines. */
export function freshRuntimeDeclinedNotice(names: readonly string[]): string {
  const list = names.join(", ");
  return (
    `[vitest-native] hotRuntime.freshRuntime declined: ${list} ${names.length === 1 ? "holds" : "hold"} ` +
    `React per worker (#719). React stays resident, as without freshRuntime.`
  );
}
