// An Expo app reads EXPO_OS; babel-preset-expo would have inlined the platform.
import { Platform } from "react-native";
import { expect, test } from "vitest";

test("EXPO_OS is the test platform", () => {
  expect(process.env.EXPO_OS).toBe(Platform.OS);
});
