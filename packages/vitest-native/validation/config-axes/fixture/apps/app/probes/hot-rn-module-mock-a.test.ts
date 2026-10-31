// A jest.mock of a React Native module to null, the shape react-native-paper's suite
// uses. Under the hot runtime the registration was still live when the per-file reset
// restored React Native for the next file; the restore threw outside Vitest's per-file
// error handling and the next file vanished from every reporter (#350). Symmetric twin
// of hot-rn-module-mock-b, so whichever file runs second is the one that can be lost.
import { Appearance } from "react-native";
import { expect, test } from "vitest";

declare const jest: { mock(path: string, factory: () => unknown): void };

jest.mock("react-native/Libraries/Utilities/Appearance", () => null);

test("a file may jest.mock a React Native module to null (a)", () => {
  expect(Appearance).toBeNull();
});
