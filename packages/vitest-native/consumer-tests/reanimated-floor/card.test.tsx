import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { vi } from "vitest";
import { Card } from "./Card";

test("a component with useAnimatedStyle renders and presses", async () => {
  const onPress = vi.fn();
  await render(<Card onPress={onPress} />);
  await fireEvent.press(screen.getByText("Press"));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("box")).toBeTruthy();
});
