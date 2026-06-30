import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react-native";
import * as React from "react";
import { Fader } from "./Fader.js";

test("renders an animated fade that resolves to its target opacity (real Animated, JS driver)", async () => {
  await render(<Fader>hello</Fader>);
  expect(screen.getByText("hello")).toBeOnTheScreen();
  // The JS-driver timing animation resolves to its `toValue` (under the native
  // engine the animation flushes to completion within render's act()).
  expect(screen.getByTestId("fader")).toHaveStyle({ opacity: 1 });
});
