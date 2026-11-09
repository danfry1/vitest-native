/**
 * Re-rendering Reanimated's real animated component, served through a jest.mock that
 * spreads jest.requireActual (react-native-paper's FABExtended test does), as under Jest
 * (#583). Each update asks Reanimated's findHostInstance for the view behind the
 * component's ref; React Native's renderer rejected a Text's ref while its RCTText host
 * was a bare string host ("Argument appears to not be a ReactComponent. Keys: instance").
 */
import * as React from "react";
import { render, screen } from "@testing-library/react-native";
import { beforeAll, expect, it } from "vitest";
import { COLD_IMPORT_BUDGET_MS } from "./support/cold-import";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  requireActual<T>(path: string): T;
};
declare const require: (id: string) => unknown;

jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual<Record<string, unknown>>("react-native-reanimated");
  return { __esModule: true, ...actual, default: actual.default };
});

// The cold loads, ahead of the tests (support/cold-import.ts), so each test's own timeout
// measures its re-render: the real Reanimated, which the mock's factory loads through Node
// file by file and a first render pulls further in, and React Native's Fabric renderer,
// which Reanimated's findHostInstance requires on a component's first update.
let Animated: typeof import("react-native-reanimated").default;
beforeAll(async () => {
  Animated = (await import("react-native-reanimated")).default;
  const warm = await render(<Animated.View />);
  await warm.unmount();
  require("react-native/Libraries/Renderer/shims/ReactFabric");
}, COLD_IMPORT_BUDGET_MS);

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
