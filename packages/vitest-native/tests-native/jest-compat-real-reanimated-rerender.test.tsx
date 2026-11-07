/**
 * Re-rendering Reanimated's real animated component, served through a jest.mock that
 * spreads jest.requireActual (react-native-paper's FABExtended test does), as under Jest
 * (#583). Each update asks Reanimated's findHostInstance for the view behind the
 * component's ref; React Native's renderer rejected a Text's ref while its RCTText host
 * was a bare string host ("Argument appears to not be a ReactComponent. Keys: instance").
 */
import * as React from "react";
import { render, screen } from "@testing-library/react-native";
import Animated from "react-native-reanimated";
import { expect, it } from "vitest";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  requireActual<T>(path: string): T;
};

jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual<Record<string, unknown>>("react-native-reanimated");
  return { __esModule: true, ...actual, default: actual.default };
});

it("re-renders the real Animated.Text", async () => {
  const view = await render(<Animated.Text>before</Animated.Text>);
  await view.rerender(<Animated.Text>after</Animated.Text>);
  expect(screen.getByText("after")).toBeTruthy();
});

it("re-renders the real Animated.View with a ref", async () => {
  const ref = React.createRef<unknown>();
  const view = await render(<Animated.View ref={ref} testID="a" />);
  await view.rerender(<Animated.View ref={ref} testID="b" />);
  expect(screen.getByTestId("b")).toBeTruthy();
});
