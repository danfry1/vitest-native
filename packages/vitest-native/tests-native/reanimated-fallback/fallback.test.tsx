/**
 * The hand-written reanimated preset under the native engine, reached through
 * auto-detection (vitest.reanimated-fallback.config.mts), with the real
 * react-native-gesture-handler 3. Gesture Handler 3's hooks and its ScrollView call
 * `isSharedValue` and `useComposedEventHandler` on the reanimated module they get, which
 * the preset lacked, so a v3 gesture and a v3 ScrollView threw "is not a function".
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
  usePanGesture,
  useTapGesture,
} from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import Animated, {
  clamp,
  interpolate,
  interpolateColor,
  isSharedValue,
  useAnimatedScrollHandler,
  useScrollOffset,
  useSharedValue,
} from "react-native-reanimated";
import { describe, expect, it } from "vitest";

describe("the reanimated preset, with gesture-handler 3", () => {
  it("is the hand-written preset: this reanimated has no Jest resolver", () => {
    // Reanimated's own mock has its jest helpers; the hand-written preset does not.
    expect((Animated as Record<string, unknown>).getAnimatedStyle).toBeUndefined();
  });

  it("runs a v3 tap gesture beside a shared-value config", async () => {
    let taps = 0;
    function Gestures() {
      const enabled = useSharedValue(true);
      const tap = useTapGesture({ testID: "tap", onActivate: () => taps++ });
      const pan = usePanGesture({ testID: "pan", enabled });
      return (
        <GestureDetector gesture={tap}>
          <GestureDetector gesture={pan}>
            <View />
          </GestureDetector>
        </GestureDetector>
      );
    }
    await render(
      <GestureHandlerRootView>
        <Gestures />
      </GestureHandlerRootView>,
    );
    fireGestureHandler(getByGestureTestId("tap"));
    expect(taps).toBe(1);
  });

  it("scrolls a v3 ScrollView", async () => {
    let offset = -1;
    await render(
      <GestureHandlerRootView>
        <ScrollView testID="scroll" onScroll={(e) => (offset = e.nativeEvent.contentOffset.y)}>
          <Text>row</Text>
        </ScrollView>
      </GestureHandlerRootView>,
    );
    await fireEvent.scroll(screen.getByTestId("scroll"), {
      nativeEvent: { contentOffset: { x: 0, y: 64 } },
    });
    expect(offset).toBe(64);
  });

  it("interpolates with reanimated's own helpers, named and on the default export", () => {
    expect(interpolate(5, [0, 10], [0, 100])).toBe(50);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(interpolateColor(1, [0, 1], ["#ff0000", "#0000ff"])).toBe("rgba(0, 0, 255, 1)");
    // oxlint-disable-next-line import/no-named-as-default-member -- default API parity is intentional
    expect(Animated.interpolate(5, [0, 10], [0, 100])).toBe(50);
    // Loading interpolateColor did not initialize reanimated (the fixture's core.js).
    expect((globalThis as Record<string, unknown>)._REANIMATED_VERSION_JS).toBeUndefined();
  });

  it("runs a scroll handler's drag events, and offsets are shared values", async () => {
    const seen: string[] = [];
    let offset: unknown;
    function List() {
      offset = useScrollOffset();
      const onScroll = useAnimatedScrollHandler({
        onScroll: (e) => seen.push(`scroll ${e.contentOffset.y}`),
        onBeginDrag: () => seen.push("begin"),
      });
      return (
        <Animated.ScrollView testID="list" onScroll={onScroll}>
          <Text>row</Text>
        </Animated.ScrollView>
      );
    }
    await render(<List />);
    const list = screen.getByTestId("list");
    await fireEvent(list, "scrollBeginDrag", { nativeEvent: { contentOffset: { y: 0 } } });
    await fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 5 } } });
    expect(seen).toEqual(["begin", "scroll 5"]);
    expect(isSharedValue(offset)).toBe(true);
  });
});
