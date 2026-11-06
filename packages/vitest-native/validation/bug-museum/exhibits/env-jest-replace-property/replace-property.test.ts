import { Platform } from "react-native";

declare const jest: { replaceProperty(object: object, key: string, value: unknown): unknown };

test("a migrated test replaces Platform.OS for one test", () => {
  let outcome: string;
  try {
    jest.replaceProperty(Platform, "OS", "android");
    outcome = Platform.OS;
  } catch (error) {
    outcome = `throws: ${String((error as Error).message).split(".")[0]}`;
  }
  expect(outcome, "jest.replaceProperty(Platform, 'OS', 'android')").toBe("android");
  jest.restoreAllMocks();
  expect(Platform.OS, "Platform.OS after jest.restoreAllMocks()").toBe("ios");
});
