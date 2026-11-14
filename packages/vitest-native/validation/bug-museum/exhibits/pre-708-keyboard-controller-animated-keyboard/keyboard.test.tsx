// A footer that rides the keyboard, migrated from Reanimated's useAnimatedKeyboard to
// keyboard-controller's compat hook, as its migration guide says.
import React from "react";
import { render, screen } from "@testing-library/react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useAnimatedKeyboard } from "react-native-keyboard-controller";
import { expect, test } from "vitest";

function Footer() {
  const keyboard = useAnimatedKeyboard();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboard.height.value }],
  }));
  return <Animated.View testID="footer" style={style} />;
}

test("a footer that follows the keyboard renders", async () => {
  await render(<Footer />);
  expect(screen.getByTestId("footer")).toBeTruthy();
});
