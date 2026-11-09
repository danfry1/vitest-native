import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { App } from "./App";

test("Gesture Handler runs with its own Jest setup when its preset is off", async () => {
  let pressed = 0;
  await render(<App onPress={() => void pressed++} />);
  await fireEvent.press(screen.getByText("Press"));
  expect(pressed).toBe(1);
  const warnings = (globalThis as Record<string, unknown>).__ghWarnings as string[];
  expect(warnings.length, "Gesture Handler warnings").toBe(0);
});
