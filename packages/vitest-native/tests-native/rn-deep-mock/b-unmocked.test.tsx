// Runs after a-mocks.test.tsx (on the same worker under --mode hot): its mocks do not
// reach this file, and the setup file's mock still does.
import { AccessibilityInfo, Appearance, BackHandler } from "react-native";

it("keeps the setup file's mock", () => {
  expect(typeof BackHandler.mockPressBack).toBe("function");
});

it("does not see another file's mocks", () => {
  expect(jest.isMockFunction(Appearance.getColorScheme)).toBe(false);
  expect(jest.isMockFunction(AccessibilityInfo.addEventListener)).toBe(false);
});
