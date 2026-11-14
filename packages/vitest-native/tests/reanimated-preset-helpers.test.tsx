/**
 * The hand-written reanimated preset, which serves under the mock engine and, under the
 * native engine, for reanimated before 4.7 (whose own mock cannot run there). Reached
 * through auto-detection, by importing the package.
 *
 * Its `interpolate` is reanimated's own (it returned the first output value). Gesture
 * Handler 3's hooks and its ScrollView call `isSharedValue` and `useComposedEventHandler`
 * on whichever reanimated module they get, which the preset lacked, so they threw. A
 * scroll handler runs its handler.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  isSharedValue,
  makeMutable,
  useAnimatedScrollHandler,
  useComposedEventHandler,
} from "react-native-reanimated";
import { describe, expect, it } from "vitest";
import { ownHelpers } from "../src/presets/reanimated.js";

describe("reanimated preset (hand-written)", () => {
  it("interpolates with reanimated's own helpers", () => {
    expect(interpolate(5, [0, 10], [0, 100])).toBe(50);
    expect(interpolate(20, [0, 10], [0, 100], Extrapolation.CLAMP)).toBe(100);
  });

  // Reanimated's own interpolateColor, loaded against this engine's React Native (#857).
  // The values are what reanimated 4.7.1 returns under the native engine; the
  // reanimated-interpolate-color cross-check probe compares every engine's against it.
  it("interpolates colours with reanimated's own interpolateColor", () => {
    expect(interpolateColor(0.25, [0, 1], ["#ff0000", "#0000ff"])).toBe("rgba(224, 0, 136, 1)");
    expect(interpolateColor(0.25, [0, 1], ["#ff0000", "#0000ff"], "HSV")).toBe(
      "rgba(255, 0, 128, 1)",
    );
    expect(interpolateColor(0.5, [0, 1], ["#ff0000", "#0000ff"], "LAB")).toBe(
      "rgba(146.3154, 91.96321, 167.12103, 1)",
    );
    expect(interpolateColor(0.25, [0, 1], ["#f008", "#0f0f"])).toBe("rgba(224, 136, 0, 0.65)");
    expect(interpolateColor(0.5, [0, 1], [0xff0000ff, 0x00ff0080])).toBe(
      "rgba(186, 186, 0, 0.751)",
    );
    expect(interpolateColor(-1, [0, 1], ["red", "blue"])).toBe("rgba(255, 0, 0, 1)");
    expect(interpolateColor(0.5, [0, 1], ["red", "blue"], "RGB", { gamma: 1 })).toBe(
      "rgba(127.5, 0, 127.5, 1)",
    );
  });

  it("keeps the named error where the project has no Babel to compile interpolateColor with", () => {
    const dir = path.dirname(require.resolve("react-native-reanimated/package.json"));
    const noBabel = fs.mkdtempSync(path.join(os.tmpdir(), "vn-no-babel-"));
    try {
      const helpers = ownHelpers(dir, false, noBabel);
      expect(helpers.interpolate?.(5, [0, 10], [0, 100])).toBe(50);
      expect(() => helpers.interpolateColor?.(0.5, [0, 1], ["red", "blue"])).toThrow(
        /interpolateColor did not load .*@babel\/core and @babel\/plugin-transform-modules-commonjs/,
      );
    } finally {
      fs.rmSync(noBabel, { recursive: true, force: true });
    }
  });

  it("tells its shared values apart", () => {
    expect(isSharedValue(makeMutable(0))).toBe(true);
    expect(isSharedValue({ value: 0 })).toBe(false);
  });

  it("runs a scroll handler, alone and composed", async () => {
    const seen: number[] = [];
    function List() {
      const onScroll = useAnimatedScrollHandler((event) => seen.push(event.contentOffset.y));
      const composed = useComposedEventHandler([onScroll, null]);
      return (
        <Animated.ScrollView testID="list" onScroll={composed}>
          <Text>row</Text>
        </Animated.ScrollView>
      );
    }
    await render(<List />);
    await fireEvent.scroll(screen.getByTestId("list"), {
      nativeEvent: { contentOffset: { y: 30 } },
    });
    expect(seen).toEqual([30]);
  });
});
