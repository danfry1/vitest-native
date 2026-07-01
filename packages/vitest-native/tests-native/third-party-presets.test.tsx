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
import { FlashList, useRecyclingState, RenderTargetOptions } from "@shopify/flash-list";
import BottomSheet, {
  BottomSheetView,
  BottomSheetModalProvider,
  SNAP_POINT_TYPE,
} from "@gorhom/bottom-sheet";
import {
  KeyboardProvider,
  KeyboardAvoidingView,
  KeyboardController,
  useKeyboardController,
} from "react-native-keyboard-controller";
import {
  scheduleOnUI,
  runOnJS,
  runOnUI,
  runOnUIAsync,
  makeShareable,
  getRuntimeKind,
  RuntimeKind,
  isWorkletFunction,
} from "react-native-worklets";

describe("@shopify/flash-list under native engine", () => {
  it("renders each data row through renderItem (no native recycler loaded)", async () => {
    await render(
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

  it("the v2 runtime exports are shadowed, not undefined", () => {
    expect(typeof useRecyclingState).toBe("function");
    expect(RenderTargetOptions.Cell).toBe("Cell");
  });
});

describe("@gorhom/bottom-sheet under native engine", () => {
  it("renders sheet content through real RN (collapsed sheet, content present)", async () => {
    await render(
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

  it("the constant enums are shadowed, not undefined", () => {
    expect(SNAP_POINT_TYPE).toEqual({ PROVIDED: 0, DYNAMIC: 1 });
  });
});

describe("react-native-keyboard-controller under native engine", () => {
  it("KeyboardProvider + KeyboardAvoidingView render children; KeyboardController is a no-op", async () => {
    await render(
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
    expect(typeof KeyboardController.preload).toBe("function");
    expect(typeof useKeyboardController).toBe("function");
  });
});

describe("react-native-worklets under native engine", () => {
  // Without the preset, importing worklets pulls in its ESM `mock.js` (which
  // ends with `module.exports = …`) through Node's externalized require and
  // throws "module is not defined in ES module scope", taking down the file.
  // The preset shadows the package so direct consumers (e.g. paper's FAB, which
  // does `import { scheduleOnUI } from 'react-native-worklets'`) load cleanly.
  it("schedulers run their worklet synchronously on the test thread", () => {
    const seen: number[] = [];
    scheduleOnUI(() => seen.push(1));
    runOnUI((n: number) => seen.push(n))(2);
    runOnJS((n: number) => seen.push(n))(3);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("runOnUIAsync resolves with the worklet's result (direct call form)", async () => {
    await expect(runOnUIAsync((n: number) => n + 1, 41)).resolves.toBe(42);
  });

  it("runtime + shareable helpers are shadowed, not undefined", () => {
    expect(makeShareable({ a: 1 })).toEqual({ a: 1 });
    expect(getRuntimeKind()).toBe(RuntimeKind.ReactNative);
    expect(isWorkletFunction(() => {})).toBe(false);
  });
});
