/**
 * Gesture Handler 3 under the native engine, reached through auto-detection: the real
 * package with its own jestSetup.js (LIBRARY_SETUP_FILES in preset-map.ts), over
 * reanimated's own mock. Its v3 components (Touchable, the GestureComponents scroll
 * view) and hook API run as themselves, and its own Jest utilities drive a gesture,
 * which no hand-written replacement of the package could serve.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
  Touchable,
  usePanGesture,
  useTapGesture,
} from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { afterEach, describe, expect, it } from "vitest";

describe("react-native-gesture-handler 3", () => {
  it("presses a Touchable", async () => {
    let presses = 0;
    await render(
      <GestureHandlerRootView>
        <Touchable testID="touchable" onPress={() => presses++}>
          <Text>press</Text>
        </Touchable>
      </GestureHandlerRootView>,
    );
    await fireEvent.press(screen.getByTestId("touchable"));
    expect(presses).toBe(1);
  });

  it("scrolls its ScrollView, which renders its children", async () => {
    let offset = -1;
    await render(
      <GestureHandlerRootView>
        <ScrollView testID="scroll" onScroll={(e) => (offset = e.nativeEvent.contentOffset.y)}>
          <Text>row</Text>
        </ScrollView>
      </GestureHandlerRootView>,
    );
    await fireEvent.scroll(screen.getByTestId("scroll"), {
      nativeEvent: { contentOffset: { x: 0, y: 120 } },
    });
    expect(offset).toBe(120);
    expect(screen.getByText("row")).toBeTruthy();
  });

  it("runs a v3 tap gesture through its own Jest utilities", async () => {
    let taps = 0;
    function Tappable() {
      const tap = useTapGesture({ testID: "tap", onActivate: () => taps++ });
      return (
        <GestureDetector gesture={tap}>
          <View testID="target" />
        </GestureDetector>
      );
    }
    await render(
      <GestureHandlerRootView>
        <Tappable />
      </GestureHandlerRootView>,
    );
    fireGestureHandler(getByGestureTestId("tap"));
    expect(taps).toBe(1);
  });

  describe("with a shared value as gesture config", () => {
    // Gesture Handler listens to it on its UI-runtime loop (a timer under worklets'
    // mock), so a missing addListener throws there, after the test, outside any
    // expect: an uncaught error that fails the run though every test passes.
    const uncaught: unknown[] = [];
    const record = (error: unknown) => uncaught.push(error);
    afterEach(() => {
      process.off("uncaughtException", record);
    });

    it("listens to it without an uncaught error", async () => {
      process.on("uncaughtException", record);
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
      // Past the UI-runtime frames that attach the listeners.
      await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
      fireGestureHandler(getByGestureTestId("tap"));
      expect(taps).toBe(1);
      expect(uncaught).toEqual([]);
    });
  });
});
