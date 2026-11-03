// See hot-rn-module-mock-a.
import { Appearance } from "react-native";
import { expect, test } from "vitest";

declare const jest: { mock(path: string, factory: () => unknown): void };

jest.mock("react-native/Libraries/Utilities/Appearance", () => null);

test("a file may jest.mock a React Native module to null (b)", () => {
  expect(Appearance).toBeNull();
});
