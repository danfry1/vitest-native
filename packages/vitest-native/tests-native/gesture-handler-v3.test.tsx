/**
 * Gesture Handler 3 under the native engine, reached through auto-detection: the real
 * package with its own jestSetup.js (LIBRARY_SETUP_FILES in preset-map.ts), over
 * reanimated's own mock. Its v3 components (Touchable, the GestureComponents scroll
 * view) and hook API run as themselves, and its own Jest utilities drive a gesture,
 * which no hand-written replacement of the package could serve.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
  Touchable,
  useTapGesture,
} from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { describe, expect, it } from "vitest";

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
});
