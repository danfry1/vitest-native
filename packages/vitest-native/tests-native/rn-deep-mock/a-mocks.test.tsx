// A jest.mock of a react-native/Libraries path is the module `react-native` exports, as
// under Jest (#573): from the setup file, from a helper the test calls, and at the top.
import { AccessibilityInfo, Appearance, BackHandler } from "react-native";

const mockAccessibilityInfo = () =>
  jest.mock("react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo", () => ({
    __esModule: true,
    default: {
      addEventListener: jest.fn(() => ({ remove() {} })),
      isReduceMotionEnabled: jest.fn(),
    },
  }));
mockAccessibilityInfo();

jest.mock("react-native/Libraries/Utilities/Appearance", () => ({
  getColorScheme: jest.fn(() => "light"),
  addChangeListener: jest.fn(() => ({ remove() {} })),
}));

it("serves a setup file's mock of a platform-specific module (BackHandler.ios.js)", () => {
  expect(typeof BackHandler.mockPressBack).toBe("function");
  expect(require("react-native/Libraries/Utilities/BackHandler").default).toBe(BackHandler);
});

it("serves a mock registered inside a helper the test calls", () => {
  expect(jest.isMockFunction(AccessibilityInfo.addEventListener)).toBe(true);
});

it("serves a top-level mock of a module react-native exports whole", () => {
  jest.mocked(Appearance.getColorScheme).mockReturnValue("dark");
  expect(Appearance.getColorScheme()).toBe("dark");
});
