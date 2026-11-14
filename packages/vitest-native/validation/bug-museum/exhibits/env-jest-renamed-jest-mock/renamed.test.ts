import { AccessibilityInfo } from "react-native";
import { jest as mockJest } from "@jest/globals";

// The renamed import satisfies babel-plugin-jest-hoist's rule that a factory reads only
// variables prefixed `mock`.
mockJest.mock("react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo", () => ({
  __esModule: true,
  default: { tag: "mocked", isScreenReaderEnabled: mockJest.fn() },
}));

test("a jest.mock made through a renamed jest applies", () => {
  expect(
    (AccessibilityInfo as unknown as { tag?: string }).tag,
    "AccessibilityInfo from the renamed jest's mock",
  ).toBe("mocked");
});
