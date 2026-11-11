/**
 * hotRuntime.freshRuntime with a preset's built-in module that uses React. Two files on one
 * hot worker each render through it. A built-in module is part of vitest-native's own dist,
 * which an install keeps under node_modules and the hot runtime never re-evaluates; with
 * React fresh per file, a module-scope import of React must not keep the first file's copy.
 * The second file then fails with "Invalid hook call", or, where the preset catches that
 * error, silently reads a default instead of the value its provider gives.
 *
 * - safe-area: react-native-safe-area-context laid out as 5.7.0 publishes it (the version
 *   Expo SDK 57 pins), whose Jest mock is source only, so the preset serves its built-in
 *   module (fixtures/fresh-preset-safe-area/vendor).
 * - navigation: useFocusEffect (throws) and useTheme inside ThemeProvider (falls back to
 *   the default theme), the navigation preset's built-in module.
 *
 * The control keeps React resident (freshRuntime: false), where the same files pass.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { runApp } from "./support/run-app";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const RESIDENT = {
  file: "vitest.config.mts",
  find: "freshRuntime: true",
  replace: "freshRuntime: false",
};

it.each([
  ["safe-area", "freshRuntime", []],
  ["safe-area", "React resident", [RESIDENT]],
  ["navigation", "freshRuntime", []],
  ["navigation", "React resident", [RESIDENT]],
] as const)(
  "%s, %s: every file renders through the preset",
  (preset, _, edits) => {
    const id = `fresh-preset-${preset}`;
    const { status, output } = runApp(id, { from: path.join(FIXTURES, id), edits: [...edits] });
    expect(output).not.toMatch(/Invalid hook call/);
    expect(status, output).toBe(0);
    expect(output).toMatch(/Test Files\s+2 passed/);
  },
  150_000,
);
