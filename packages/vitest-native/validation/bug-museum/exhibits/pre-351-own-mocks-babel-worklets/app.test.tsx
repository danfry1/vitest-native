import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { App } from "./App";

// Their Reanimated mock spreads jest.requireActual, so useAnimatedStyle is Reanimated's
// real hook, which needs the worklets plugin their babel.config.js lists.
test("the app renders with the project's own mocks", async () => {
  let pressed = 0;
  await render(<App onPress={() => void pressed++} />);
  await fireEvent.press(screen.getByText("Press"));
  expect(pressed).toBe(1);
});
