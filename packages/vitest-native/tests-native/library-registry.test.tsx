/**
 * The per-file cost of Reanimated's own mock under the native engine. Its module graph,
 * worklets' and their own dependencies are served from the precompiled library registry
 * (native/registry.mjs, buildLibraryRegistry), layered on React Native's. So a file that
 * uses Reanimated loads none of their ~340 modules through Node and resolves none of
 * their requires, which file-by-file loading did on every file (about 330 Node loads and
 * 670 resolutions per file under the hot runtime). Each file runs only the library
 * modules it reaches, from a reset registry, as it runs React Native's.
 *
 * Runs in the native suite under both runtimes: the stock one (vitest.config.mts) and
 * the hot one (vitest.hot.config.mts), where a worker has usually run Reanimated for an
 * earlier file already.
 */
import { createRequire } from "node:module";
import path from "node:path";
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "vitest";
import { projectContext } from "../src/context.mjs";

interface LibraryRegistry {
  ids: string[];
  packages: string[];
  ran(): string[];
}

const projectRoot = projectContext()?.projectRoot ?? process.cwd();
const req = createRequire(path.join(projectRoot, "package.json"));
const library = (): LibraryRegistry | null => {
  const file = projectContext()?.registry;
  return file ? req(file).__vitestNativeRegistry.library : null;
};

// Taken as the file starts, before anything in it imports Reanimated (the test imports
// it itself).
const memo = (): { hits: number; misses: number; stale: number } =>
  (globalThis as Record<symbol, any>)[Symbol.for("vitest-native.resolutionMemo")];
const resolutionsSoFar = (): number => memo().hits + memo().misses + memo().stale;
const atStart = {
  modules: new Set(Object.keys(req.cache)),
  resolutions: resolutionsSoFar(),
  ran: library()?.ran() ?? null,
};

// The packages the library registry holds, by directory.
const REANIMATED_FILE = /[\\/]node_modules[\\/]react-native-reanimated[\\/]/;
const LIBRARY_FILE =
  /[\\/]node_modules[\\/](react-native-reanimated|react-native-worklets|semver|react-native-is-edge-to-edge)[\\/]/;

describe("library registry: per-file cost of Reanimated's own mock", () => {
  it("is built for Reanimated, worklets and their own dependencies", () => {
    const registry = library();
    expect(registry).not.toBeNull();
    expect(registry!.packages).toEqual(
      expect.arrayContaining([
        "react-native-reanimated",
        "react-native-worklets",
        "semver",
        "react-native-is-edge-to-edge",
      ]),
    );
    // React Native's files, and the packages shared with the app as peers, stay out.
    expect(registry!.packages).not.toContain("react-native");
    expect(registry!.packages).not.toContain("react");
  });

  it("starts the file with only worklets' mock run, which its setup builds", () => {
    // Worklets' mock sets requestAnimationFrame as it loads, so it is built as the
    // file is set up (native/setup.mjs); nothing of Reanimated runs until the file
    // imports it.
    expect(atStart.ran).not.toBeNull();
    expect(atStart.ran!.filter((file) => REANIMATED_FILE.test(file))).toEqual([]);
    expect(atStart.ran!.every((file) => /react-native-worklets/.test(file))).toBe(true);
  });

  it("runs Reanimated without loading or resolving its modules through Node", async () => {
    const Reanimated = await import("react-native-reanimated");
    const { default: Animated, useSharedValue, useAnimatedStyle, withTiming } = Reanimated;
    function Box() {
      const width = useSharedValue(10);
      const style = useAnimatedStyle(() => ({ width: width.value }));
      width.value = withTiming(20);
      return React.createElement(
        Animated.View,
        { testID: "box", style },
        React.createElement(Text, null, "box"),
      );
    }
    await render(React.createElement(Box));
    expect(screen.getByTestId("box")).toBeTruthy();

    const loaded = Object.keys(req.cache).filter((file) => !atStart.modules.has(file));
    expect(loaded.filter((file) => LIBRARY_FILE.test(file))).toEqual([]);
    // A handful, for the preset's own lookups, against one or more for each of the
    // library's modules when they load file by file.
    expect(resolutionsSoFar() - atStart.resolutions).toBeLessThanOrEqual(8);
    // Served from the registry: the modules this file reached ran, and no more than
    // the registry holds.
    const ran = library()!.ran();
    expect(ran.filter((file) => REANIMATED_FILE.test(file)).length).toBeGreaterThan(0);
    expect(ran.length).toBeLessThanOrEqual(library()!.ids.length);
  });
});
