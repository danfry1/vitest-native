/**
 * A `jest` imported from @jest/globals under another name is the jest object, as
 * babel-plugin-jest-hoist follows it: its jest.mock calls are hoisted and registered like
 * the global's (#833). `jest as mockJest` is the usual way to satisfy jest-hoist's rule
 * that a factory reads only variables prefixed `mock`.
 */
import { AccessibilityInfo } from "react-native";
import { jest as mockJest } from "@jest/globals";
import * as globals from "@jest/globals";
import { greet } from "./fixtures/greeter";
import { expect, it } from "vitest";

mockJest.mock("react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo", () => ({
  __esModule: true,
  default: { tag: "mocked", isScreenReaderEnabled: mockJest.fn() },
}));

globals.jest.mock("./fixtures/greeter", () => ({ greet: () => "mocked-hello" }));

it("applies a mock made through a renamed jest to React Native's own require", () => {
  expect((AccessibilityInfo as unknown as { tag: string }).tag).toBe("mocked");
  expect(require("react-native").AccessibilityInfo.tag).toBe("mocked");
  expect(mockJest.isMockFunction(AccessibilityInfo.isScreenReaderEnabled)).toBe(true);
});

it("applies a mock made through the namespace's jest", () => {
  expect(greet()).toBe("mocked-hello");
  expect(require("./fixtures/greeter").greet()).toBe("mocked-hello");
});
