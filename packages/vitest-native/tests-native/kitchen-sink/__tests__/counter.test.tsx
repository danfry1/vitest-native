import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { fetch as fetchNetInfo } from "@react-native-community/netinfo";
import { Counter } from "../src/components/Counter";
import { track } from "../src/services/analytics";

jest.mock("../src/services/analytics");

test("renders, presses, and reaches every kind of mock", async () => {
  await render(<Counter label="Count" />);
  await fireEvent.press(screen.getByRole("button"));
  expect(screen.getByText("Count: 1")).toBeTruthy();
  // The mock beside the module.
  expect(jest.mocked(track)).toHaveBeenCalledWith("press 1");
  // The library's own Jest mock, from the setup file.
  expect(jest.isMockFunction(fetchNetInfo)).toBe(true);
  expect((globalThis as Record<string, unknown>).__kitchenSinkSetup).toBe(true);
});
