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

describe("reanimated preset (hand-written)", () => {
  it("interpolates with reanimated's own helpers", () => {
    expect(interpolate(5, [0, 10], [0, 100])).toBe(50);
    expect(interpolate(20, [0, 10], [0, 100], Extrapolation.CLAMP)).toBe(100);
  });

  // Reanimated's interpolateColor imports React Native, which this engine does not run
  // (under the native engine it is reanimated's own: tests-native/reanimated.test.tsx).
  it("says why interpolateColor is unavailable, rather than answering wrongly", () => {
    expect(() => interpolateColor(1, [0, 1], ["#ff0000", "#0000ff"])).toThrow(/native engine/);
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
