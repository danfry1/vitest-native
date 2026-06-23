/**
 * Proof that flash-list, bottom-sheet, and keyboard-controller render under the
 * native engine via the preset-shadow mechanism — each lib's native runtime
 * (recycler / reanimated worklets / keyboard native modules) never loads, while
 * the surrounding tree renders through REAL React Native.
 *
 * Each lib is installed as a devDependency so this proves auto-detection + correct
 * shadowing end to end. See tests-native/third-party-stack.test.tsx for the
 * gesture-handler / safe-area / navigation equivalent.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { FlashList } from "@shopify/flash-list";
import BottomSheet, { BottomSheetView, BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import {
  KeyboardProvider,
  KeyboardAvoidingView,
  KeyboardController,
} from "react-native-keyboard-controller";

describe("@shopify/flash-list under native engine", () => {
  it("renders each data row through renderItem (no native recycler loaded)", () => {
    render(
      <FlashList
        testID="list"
        data={["one", "two", "three"]}
        renderItem={({ item }) => <Text>{item}</Text>}
      />,
    );
    expect(screen.getByTestId("list")).toBeTruthy();
    expect(screen.getByText("one")).toBeTruthy();
    expect(screen.getByText("three")).toBeTruthy();
  });
});

describe("@gorhom/bottom-sheet under native engine", () => {
  it("renders sheet content through real RN (collapsed sheet, content present)", () => {
    render(
      <BottomSheetModalProvider>
        <BottomSheet>
          <BottomSheetView testID="sheet">
            <Text>sheet content</Text>
          </BottomSheetView>
        </BottomSheet>
      </BottomSheetModalProvider>,
    );
    expect(screen.getByTestId("sheet")).toBeTruthy();
    expect(screen.getByText("sheet content")).toBeTruthy();
  });
});

describe("react-native-keyboard-controller under native engine", () => {
  it("KeyboardProvider + KeyboardAvoidingView render children; KeyboardController is a no-op", () => {
    render(
      <KeyboardProvider>
        <KeyboardAvoidingView testID="kav">
          <Text>typed</Text>
        </KeyboardAvoidingView>
      </KeyboardProvider>,
    );
    expect(screen.getByTestId("kav")).toBeTruthy();
    expect(screen.getByText("typed")).toBeTruthy();
    expect(() => KeyboardController.dismiss()).not.toThrow();
    expect(KeyboardController.isVisible()).toBe(false);
  });
});
