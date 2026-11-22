import { render, screen } from "@testing-library/react-native";
import Animated from "react-native-reanimated";

// react-native-paper's FABExtended test serves the real Reanimated this way.
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return { __esModule: true, ...actual, default: actual.default };
});

test("re-rendering the real Animated.Text keeps working", async () => {
  const view = await render(<Animated.Text>before</Animated.Text>);
  await view.rerender(<Animated.Text>after</Animated.Text>);
  expect(screen.getByText("after")).toBeTruthy();
});
