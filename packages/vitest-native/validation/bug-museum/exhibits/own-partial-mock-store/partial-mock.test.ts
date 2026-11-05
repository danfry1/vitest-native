// A Jest partial mock of project source.
import { expect, test } from "vitest";
import { other, read } from "./src/api";
import { setValue } from "./src/consumer";

declare const jest: {
  mock(path: string, factory?: () => unknown): void;
  fn<T extends (...args: never[]) => unknown>(impl?: T): T;
  requireActual<T = Record<string, unknown>>(path: string): T;
  useFakeTimers(config?: Record<string, unknown>): unknown;
  useRealTimers(): unknown;
};

jest.mock("./src/api", () => ({
  ...jest.requireActual("./src/api"),
  other: jest.fn(() => "mocked"),
}));

test("the real members of a partial mock share the app's store", () => {
  setValue("set-by-the-app");
  expect(other()).toBe("mocked");
  expect(read()).toBe("set-by-the-app");
});
