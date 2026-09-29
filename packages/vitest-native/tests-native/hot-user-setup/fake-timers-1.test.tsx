import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { expect, test, vi } from "vitest";

test("file 1 renders under the fake timers its setup file installed", async () => {
  expect(vi.isFakeTimers()).toBe(true);
  await render(<Text>file 1</Text>);
  expect(screen.getByText("file 1")).toBeTruthy();
});
