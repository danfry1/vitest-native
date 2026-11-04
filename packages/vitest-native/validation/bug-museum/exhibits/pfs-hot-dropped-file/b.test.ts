// A jest.mock of a React Native module to null, the shape react-native-paper's suite uses.
// Symmetric twin of the other file, so whichever runs second is the one that can be lost.
import { Appearance } from "react-native";
import { expect, test } from "vitest";

declare const jest: { mock(path: string, factory: () => unknown): void };

jest.mock("react-native/Libraries/Utilities/Appearance", () => null);

test("a file may jest.mock a React Native module to null (b)", () => {
  expect(Appearance).toBeNull();
});
