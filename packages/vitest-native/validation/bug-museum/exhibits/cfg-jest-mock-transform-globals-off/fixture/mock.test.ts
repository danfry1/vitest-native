// jest.mock under jestMockTransform, with Vitest's default globals: false.
import { expect, test } from "vitest";
import { other } from "./src/api";

declare const jest: {
  mock(path: string, factory?: () => unknown): void;
  fn<T extends (...args: never[]) => unknown>(impl?: T): T;
  requireActual<T = Record<string, unknown>>(path: string): T;
  useFakeTimers(config?: Record<string, unknown>): unknown;
  useRealTimers(): unknown;
};

jest.mock("./src/api", () => ({ other: () => "mocked" }));

test("jest.mock applies", () => {
  expect(other()).toBe("mocked");
});
