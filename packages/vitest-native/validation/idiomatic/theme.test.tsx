import { expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react-native";
import * as React from "react";
import { ThemeProvider, ThemeScreen } from "./theme.js";

test("toggling the switch flips the context theme across components", async () => {
  await render(
    <ThemeProvider>
      <ThemeScreen />
    </ThemeProvider>,
  );
  expect(screen.getByTestId("theme-label")).toHaveTextContent("Theme: light");

  await fireEvent(screen.getByTestId("theme-switch"), "valueChange", true);
  expect(screen.getByTestId("theme-label")).toHaveTextContent("Theme: dark");
});
