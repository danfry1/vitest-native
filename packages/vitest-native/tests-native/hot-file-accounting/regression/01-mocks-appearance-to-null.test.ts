import { Appearance } from "react-native";
import { expect, test, vi } from "vitest";

const jest = vi;

// react-native-paper's PaperProvider suite does this to test a missing Appearance
// module. The registration is still live when the hot runtime restores the realm for
// the next file, and the Appearance restore reaches its module through Node.
jest.mock("react-native/Libraries/Utilities/Appearance", () => null);

test("a file may jest.mock Appearance to null", () => {
  expect(Appearance).toBeNull();
});
