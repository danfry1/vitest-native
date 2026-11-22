// With the project's restoreMocks set, a jest.replaceProperty() replacement is restored
// before the next test, as Jest's restoreMocks restores it.
import { Platform } from "react-native";
import { expect, test, vi } from "vitest";

declare const jest: typeof vi & {
  replaceProperty<T extends object, K extends keyof T>(object: T, key: K, value: T[K]): unknown;
};

test("replaces and leaves it replaced", () => {
  jest.replaceProperty(Platform, "OS", "android");
  expect(Platform.OS).toBe("android");
});

test("the next test sees the original value", () => {
  expect(Platform.OS).toBe("ios");
});
