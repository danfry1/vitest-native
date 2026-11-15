// A `jest` imported from @jest/globals under another name is the jest object, as
// babel-plugin-jest-hoist follows it: its jest.mock calls are hoisted and registered like
// the global's (#833). `jest as mockJest` is the usual way to satisfy jest-hoist's rule
// that a factory reads only variables prefixed `mock`.
import { jest as mockJest } from "@jest/globals";
import * as globals from "@jest/globals";
import { greet } from "../fixtures/greeter";
import { get } from "../fixtures/api";

mockJest.mock("../fixtures/greeter", () => ({ greet: mockJest.fn(() => "mocked-hello") }));
globals.jest.mock("../fixtures/api", () => ({ get: () => "mocked-get" }));

test("a mock made through a renamed jest applies to imports and require", () => {
  expect(greet()).toBe("mocked-hello");
  expect(mockJest.isMockFunction(greet)).toBe(true);
  expect(require("../fixtures/greeter").greet).toBe(greet);
});

test("a mock made through the namespace's jest applies to imports and require", () => {
  expect(get()).toBe("mocked-get");
  expect(require("../fixtures/api").get()).toBe("mocked-get");
});
