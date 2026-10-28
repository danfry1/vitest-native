/**
 * Libraries whose own Jest support is a setup file run as themselves under the native
 * engine, with that file run first (LIBRARY_SETUP_FILES in preset-map.ts), as a Jest
 * suite lists it in `setupFiles`. Each replaces only the library's native layer.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import * as GH from "react-native-gesture-handler";
import { FlashList } from "@shopify/flash-list";
import { describe, expect, it, vi } from "vitest";

describe("react-native-gesture-handler, with its jestSetup", () => {
  it("is the real package: gesture-handler 3's hook API and builder methods", () => {
    expect(typeof (GH as Record<string, unknown>).usePanGesture).toBe("function");
    expect(typeof GH.Gesture.Pan().onBegin).toBe("function");
  });

  it("presses a Pressable through its own mocks", async () => {
    let presses = 0;
    await render(
      <GH.GestureHandlerRootView>
        <GH.Pressable testID="press" onPress={() => presses++}>
          <Text>go</Text>
        </GH.Pressable>
      </GH.GestureHandlerRootView>,
    );
    fireEvent.press(screen.getByTestId("press"));
    expect(presses).toBe(1);
  });
});

describe("@shopify/flash-list, with its jestSetup", () => {
  const rows = () => Array.from({ length: 200 }, (_, i) => i);
  const rendered = () => rows().filter((i) => screen.queryByText(`row ${i}`)).length;
  const list = () => (
    <FlashList data={rows()} renderItem={({ item }) => <Text>{`row ${item}`}</Text>} />
  );

  // jestSetup measures the list 400x900 and each row 100x100. FlashList then renders a
  // window and fills it in on a later frame: 10 rows, then 15, as under Jest with the
  // same setup. Without the setup's measurements every one of the 200 rows rendered.
  const settled = async () => {
    await render(list());
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    return rendered();
  };

  it("renders a window of rows over the layout its setup measures, as under Jest", async () => {
    expect(await settled()).toBe(15);
  });

  it("keeps that layout through vi.resetAllMocks()", async () => {
    vi.resetAllMocks();
    expect(await settled()).toBe(15);
  });
});
