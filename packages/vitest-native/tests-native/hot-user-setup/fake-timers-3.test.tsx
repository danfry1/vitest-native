import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, test, vi } from "vitest";

test("file 3 renders under the fake timers its setup file installed", async () => {
  expect(vi.isFakeTimers()).toBe(true);
  await render(<Text>file 3</Text>);
  expect(screen.getByText("file 3")).toBeTruthy();
});
