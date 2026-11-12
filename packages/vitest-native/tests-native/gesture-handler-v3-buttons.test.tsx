/**
 * Gesture Handler 3's buttons under the native engine, as an app's tests reach them
 * through Testing Library: found by role and accessible name, pressed by userEvent and
 * fireEvent. Touchable, RectButton and BorderlessButton render the native button host
 * (components/GestureHandlerButton), which the package's jestSetup.js leaves real, so
 * Node rendered a bare host whose callbacks (`onButtonPress`, a native gesture) nothing
 * in a test could reach. Here they press as on a device: Touchable through the button's
 * own events, RectButton and BorderlessButton through their native gesture's states.
 */
import React from "react";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  BorderlessButton,
  GestureHandlerRootView,
  RectButton,
  Touchable,
} from "react-native-gesture-handler";
import { withUnistyles } from "react-native-unistyles";
import { describe, expect, it, vi } from "vitest";

// An app's button: Touchable wrapped for theme tokens (#351).
const StyledTouchable = withUnistyles(Touchable);

type ButtonProps = { onPress: () => void; disabled?: boolean };

const buttons: Record<string, (props: ButtonProps) => React.ReactElement> = {
  "withUnistyles(Touchable)": ({ onPress, disabled }) => (
    <StyledTouchable accessible accessibilityRole="button" onPress={onPress} disabled={disabled}>
      <Text>Buy</Text>
    </StyledTouchable>
  ),
  RectButton: ({ onPress, disabled }) => (
    <RectButton accessible accessibilityRole="button" onPress={onPress} enabled={!disabled}>
      <Text>Buy</Text>
    </RectButton>
  ),
  BorderlessButton: ({ onPress, disabled }) => (
    <BorderlessButton accessible accessibilityRole="button" onPress={onPress} enabled={!disabled}>
      <Text>Buy</Text>
    </BorderlessButton>
  ),
};

function renderButton(Button: (props: ButtonProps) => React.ReactElement, props: ButtonProps) {
  return render(
    <GestureHandlerRootView>
      <Button {...props} />
    </GestureHandlerRootView>,
  );
}

describe.each(Object.entries(buttons))("Gesture Handler 3 %s", (_name, Button) => {
  it("is pressed once by userEvent, found by role and accessible name", async () => {
    const onPress = vi.fn();
    await renderButton(Button, { onPress });
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Buy" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is pressed once by fireEvent, on the button or its text", async () => {
    const onPress = vi.fn();
    await renderButton(Button, { onPress });
    await fireEvent.press(screen.getByRole("button", { name: "Buy" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText("Buy"));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("is not pressed while disabled", async () => {
    const onPress = vi.fn();
    await renderButton(Button, { onPress, disabled: true });
    const user = userEvent.setup();
    await user.press(screen.getByText("Buy"));
    await fireEvent.press(screen.getByText("Buy"));
    expect(onPress).not.toHaveBeenCalled();
  });
});

it("a Touchable gets press-in, press-out and press, each with the button event", async () => {
  const events: string[] = [];
  await render(
    <GestureHandlerRootView>
      <Touchable
        onPressIn={() => events.push("pressIn")}
        onPressOut={() => events.push("pressOut")}
        onPress={(e) => events.push(`press:${typeof e.pointerInside}`)}
      >
        <Text>Buy</Text>
      </Touchable>
    </GestureHandlerRootView>,
  );
  await userEvent.setup().press(screen.getByText("Buy"));
  expect(events).toEqual(["pressIn", "pressOut", "press:boolean"]);
});
