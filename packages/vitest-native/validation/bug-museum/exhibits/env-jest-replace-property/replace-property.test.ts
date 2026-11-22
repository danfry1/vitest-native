import { Platform } from "react-native";

declare const jest: { replaceProperty(object: object, key: string, value: unknown): unknown };

test("a migrated test replaces Platform.OS for one test", () => {
  let outcome: string;
  try {
    jest.replaceProperty(Platform, "OS", "android");
    outcome = Platform.OS;
  } catch (error) {
    // A short label: Vitest shortens long strings in an assertion's message.
    outcome = /has no Vitest equivalent/.test(String((error as Error).message))
      ? "unsupported"
      : "throws";
  }
  expect(outcome, "jest.replaceProperty(Platform, 'OS', 'android')").toBe("android");
  jest.restoreAllMocks();
  expect(Platform.OS, "Platform.OS after jest.restoreAllMocks()").toBe("ios");
});
