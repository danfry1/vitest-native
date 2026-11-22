import { source } from "resident-singleton";

// React Native's index exports Platform as this module's default, under Jest too.
jest.mock("react-native/Libraries/Utilities/Platform", () => {
  const actual = jest.requireActual("react-native/Libraries/Utilities/Platform");
  return { __esModule: true, ...actual, default: { ...actual.default, OS: "android" } };
});

test("the root manual mock applies to the import and to require()", () => {
  expect(source).toBe("root manual mock");
  expect(require("resident-singleton").source).toBe("root manual mock");
});

test("a deep react-native mock that spreads requireActual is react-native's export", () => {
  expect(require("react-native").Platform.OS).toBe("android");
});

test("fake timers work alongside the mocks", () => {
  jest.useFakeTimers();
  const fn = jest.fn();
  setTimeout(fn, 1000);
  jest.advanceTimersByTime(1000);
  expect(fn).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
