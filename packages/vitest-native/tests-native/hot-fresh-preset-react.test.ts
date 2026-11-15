/**
 * hotRuntime.freshRuntime with presets whose mocks render through React (#719). A
 * preset's module is part of vitest-native's own dist, which the hot runtime keeps
 * resident; a mock it built with a React of its own kept the first file's copy, so with
 * React fresh per file a later file failed with "Invalid hook call", or, where the preset
 * caught that error, read a default instead of the value its provider gives. A preset's
 * factory now builds its mock with the test file's React.
 *
 * Files on one hot worker each render through a preset, and check that each has its own
 * React (and, in the resident control, the first file's). One app holds two files per
 * preset, so the gate costs one run per mode rather than one per preset (each run takes
 * up to a minute on Windows CI):
 * - safe-area: react-native-safe-area-context laid out as 5.7.0 publishes it (the version
 *   Expo SDK 57 pins), whose Jest mock is source only, so the preset serves its built-in
 *   module (fixtures/fresh-presets/vendor);
 * - navigation: useFocusEffect, and useTheme inside ThemeProvider;
 * - reanimated: useDerivedValue's subscription, made in an effect and stopped on unmount,
 *   and a shared value kept per component;
 * - unistyles: useUnistyles(), which subscribes with useSyncExternalStore;
 * - mmkv: useMMKVString(), which keeps its value with useState (a 2.x stand-in in vendor/:
 *   from 3 on the library tests itself and the preset steps aside);
 * - webview: WebView hands its methods to a ref (useImperativeHandle; a stand-in too);
 * - gesture-handler: the library itself, which the native engine runs with its own Jest
 *   setup rather than the preset, with its Pressable;
 * - own-mock: safe-area serving the installed library's own mock.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { runApp } from "./support/run-app";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
// Two per preset, as fixtures/fresh-presets lays them out.
const FILES = [
  "frame-1.test.tsx", // safe-area
  "frame-2.test.tsx",
  "navigation-1.test.tsx",
  "navigation-2.test.tsx",
  "derived-1.test.tsx", // reanimated
  "derived-2.test.tsx",
  "theme-1.test.tsx", // unistyles
  "theme-2.test.tsx",
  "storage-1.test.tsx", // mmkv
  "storage-2.test.tsx",
  "web-1.test.tsx", // webview
  "web-2.test.tsx",
  "pressable-1.test.tsx", // gesture-handler
  "pressable-2.test.tsx",
];
const run = (id: string, edits: { file: string; find: string; replace: string }[] = []) =>
  runApp(id, { from: path.join(FIXTURES, id), edits });

it("every preset under freshRuntime: every file renders, each with its own React", () => {
  const { status, output } = run("fresh-presets");
  expect(output).not.toMatch(/Invalid hook call/);
  expect(status, output).toBe(0);
  expect(output).toMatch(new RegExp(`Test Files\\s+${FILES.length} passed`));
}, 300_000);

it("every preset with React resident: every file renders, with the first file's React", () => {
  const { status, output } = run("fresh-presets", [
    { file: "vitest.config.mts", find: "freshRuntime: true", replace: "freshRuntime: false" },
    ...FILES.map((file) => ({
      file,
      find: "const fresh = true;",
      replace: "const fresh = false;",
    })),
  ]);
  expect(status, output).toBe(0);
  expect(output).toMatch(new RegExp(`Test Files\\s+${FILES.length} passed`));
}, 300_000);

it("the library's own mock under freshRuntime: each file renders with its own React", () => {
  const { status, output } = run("fresh-preset-own-mock");
  expect(status, output).toBe(0);
  expect(output).toMatch(/Test Files\s+2 passed/);
}, 150_000);
