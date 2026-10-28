// A Jest partial mock of a detected workspace React Native package.
import { expect, test } from "vitest";
import { other, real } from "@m/ui";

declare const jest: {
  mock(path: string, factory?: () => unknown): void;
  fn<T extends (...args: never[]) => unknown>(impl?: T): T;
  requireActual<T = Record<string, unknown>>(path: string): T;
  useFakeTimers(config?: Record<string, unknown>): unknown;
  useRealTimers(): unknown;
};

jest.mock("@m/ui", () => ({
  ...jest.requireActual("@m/ui"),
  other: jest.fn(() => "mocked"),
}));

test("a partial mock of a workspace React Native package keeps its real members", () => {
  expect(real()).toBe("real");
  expect(other()).toBe("mocked");
});
