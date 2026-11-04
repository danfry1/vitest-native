// A Jest partial mock of project source. A synchronous requireActual made Node compile a
// second copy of the module and its store, so the mock's real `read` saw Node's store
// while the app wrote Vite's.
import { expect, test } from "vitest";
import { other, read } from "../src/partial-mock/api";
import { setValue } from "../src/partial-mock/consumer";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: never[]) => unknown>(impl: T): T;
  requireActual<T = Record<string, unknown>>(path: string): T;
};

jest.mock("../src/partial-mock/api", () => ({
  ...jest.requireActual("../src/partial-mock/api"),
  other: jest.fn(() => "mocked"),
}));

test("the real members of a partial mock share the app's store", () => {
  setValue("set-by-the-app");
  expect(other()).toBe("mocked");
  expect(read()).toBe("set-by-the-app");
});
