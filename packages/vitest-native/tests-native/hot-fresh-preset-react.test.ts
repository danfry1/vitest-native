/**
 * hotRuntime.freshRuntime with presets whose mocks render through React (#719). A
 * preset's module is part of vitest-native's own dist, which the hot runtime keeps
 * resident; a mock it built with a React of its own kept the first file's copy, so with
 * React fresh per file a later file failed with "Invalid hook call", or, where the preset
 * caught that error, read a default instead of the value its provider gives. A preset's
 * factory now builds its mock with the test file's React.
 *
 * Two files on one hot worker each render through a preset, and check that each has its
 * own React (and, in the resident control, the first file's):
 * - safe-area: react-native-safe-area-context laid out as 5.7.0 publishes it (the version
 *   Expo SDK 57 pins), whose Jest mock is source only, so the preset serves its built-in
 *   module (fixtures/fresh-preset-safe-area/vendor);
 * - navigation: useFocusEffect, and useTheme inside ThemeProvider;
 * - reanimated: useDerivedValue's subscription, made in an effect and stopped on unmount,
 *   and a shared value kept per component;
 * - gesture-handler: Pressable, which keeps its pressed state with useState;
 * - own-mock: safe-area serving the installed library's own mock.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { runApp } from "./support/run-app";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const FILES = {
  "safe-area": ["frame-1.test.tsx", "frame-2.test.tsx"],
  navigation: ["navigation-1.test.tsx", "navigation-2.test.tsx"],
  reanimated: ["derived-1.test.tsx", "derived-2.test.tsx"],
  "gesture-handler": ["pressable-1.test.tsx", "pressable-2.test.tsx"],
};
const run = (id: string, edits: { file: string; find: string; replace: string }[] = []) =>
  runApp(id, { from: path.join(FIXTURES, id), edits });
const resident = (files: string[]) => [
  { file: "vitest.config.mts", find: "freshRuntime: true", replace: "freshRuntime: false" },
  ...files.map((file) => ({ file, find: "const fresh = true;", replace: "const fresh = false;" })),
];

it.each(["safe-area", "navigation", "reanimated", "gesture-handler"] as const)(
  "%s under freshRuntime: every file renders, each with its own React",
  (preset) => {
    const { status, output } = run(`fresh-preset-${preset}`);
    expect(output).not.toMatch(/Invalid hook call/);
    expect(status, output).toBe(0);
    expect(output).toMatch(/Test Files\s+2 passed/);
  },
  150_000,
);

it.each(["safe-area", "navigation", "reanimated", "gesture-handler"] as const)(
  "%s with React resident: every file renders, with the first file's React",
  (preset) => {
    const { status, output } = run(`fresh-preset-${preset}`, resident(FILES[preset]));
    expect(status, output).toBe(0);
    expect(output).toMatch(/Test Files\s+2 passed/);
  },
  150_000,
);

it("the library's own mock under freshRuntime: each file renders with its own React", () => {
  const { status, output } = run("fresh-preset-own-mock");
  expect(status, output).toBe(0);
  expect(output).toMatch(/Test Files\s+2 passed/);
}, 150_000);
