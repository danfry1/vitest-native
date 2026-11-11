/**
 * hotRuntime.freshRuntime and the presets whose module holds React per worker (#719). A
 * preset's built-in module is part of vitest-native's own dist, which the hot runtime keeps
 * resident; its module-scope import of React keeps the first file's copy, so with React
 * fresh per file a later file fails with "Invalid hook call", or, where the preset catches
 * that error, reads a default instead of the value its provider gives. While such a preset
 * is active, freshRuntime declines with one line, and React stays resident.
 *
 * Two files on one hot worker each render through a preset:
 * - safe-area: react-native-safe-area-context laid out as 5.7.0 publishes it (the version
 *   Expo SDK 57 pins), whose Jest mock is source only, so the preset serves its built-in
 *   module (fixtures/fresh-preset-safe-area/vendor);
 * - navigation: useFocusEffect, and useTheme inside ThemeProvider;
 * - own-mock: safe-area alone, serving the installed library's own mock. No preset holds
 *   React, so freshRuntime stays on, and each file renders with its own React.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { runApp } from "./support/run-app";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const run = (id: string, edits: { file: string; find: string; replace: string }[] = []) =>
  runApp(id, { from: path.join(FIXTURES, id), edits });
const RESIDENT = {
  file: "vitest.config.mts",
  find: "freshRuntime: true",
  replace: "freshRuntime: false",
};
const DECLINED = /hotRuntime\.freshRuntime declined: ([^\n]*) holds? React per worker \(#719\)/;

it.each([
  ["safe-area", "safeAreaContext"],
  ["navigation", "navigation"],
])(
  "%s: freshRuntime declines, naming the preset, and every file renders",
  (preset, name) => {
    const { status, output } = run(`fresh-preset-${preset}`);
    expect(output).not.toMatch(/Invalid hook call/);
    expect(output.match(DECLINED)?.[1].split(", "), output).toContain(name);
    expect(status, output).toBe(0);
    expect(output).toMatch(/Test Files\s+2 passed/);
  },
  150_000,
);

it.each(["safe-area", "navigation"])(
  "%s with React resident: every file renders",
  (preset) => {
    const { status, output } = run(`fresh-preset-${preset}`, [RESIDENT]);
    expect(output).not.toMatch(DECLINED);
    expect(status, output).toBe(0);
    expect(output).toMatch(/Test Files\s+2 passed/);
  },
  150_000,
);

it("a run whose presets hold no React keeps freshRuntime: each file renders with its own React", () => {
  const { status, output } = run("fresh-preset-own-mock");
  expect(output).not.toMatch(DECLINED);
  expect(status, output).toBe(0);
  expect(output).toMatch(/Test Files\s+2 passed/);
}, 150_000);
