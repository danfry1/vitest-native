import React from "react";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { GestureHandlerRootView, RectButton, Touchable } from "react-native-gesture-handler";
import { withUnistyles } from "react-native-unistyles";

const StyledTouchable = withUnistyles(Touchable);
const NOT_PRESSED = "a Gesture Handler 3 button was not pressed";

test("a themed Touchable is pressed by userEvent, found by role and name", async () => {
  const onPress = vi.fn();
  await render(
    <GestureHandlerRootView>
      <StyledTouchable accessible accessibilityRole="button" onPress={onPress}>
        <Text>Buy</Text>
      </StyledTouchable>
    </GestureHandlerRootView>,
  );
  await userEvent.setup().press(await screen.findByRole("button", { name: "Buy" }));
  expect(onPress.mock.calls.length, NOT_PRESSED).toBe(1);
});

test("a RectButton is pressed by fireEvent", async () => {
  const onPress = vi.fn();
  await render(
    <GestureHandlerRootView>
      <RectButton onPress={onPress}>
        <Text>Buy</Text>
      </RectButton>
    </GestureHandlerRootView>,
  );
  await fireEvent.press(screen.getByText("Buy"));
  expect(onPress.mock.calls.length, NOT_PRESSED).toBe(1);
});
