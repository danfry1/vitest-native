/**
 * The canonical Jest partial mock, of project source, with the mocked module imported
 * BEFORE the store its real members read:
 *
 *   jest.mock('./api', () => ({ ...jest.requireActual('./api'), other: jest.fn() }))
 *
 * Jest has one registry, so the real `read` and the test share one store. Here the
 * factory runs while the first import is evaluated, before Vite has reached the store,
 * and a synchronous requireActual loaded `api` — and its own store — through Node: the
 * test set one copy and `read` returned the other, still null. jestMockTransform now
 * loads it with `vi.importActual` (transform.ts), so it is the store Vite evaluates.
 *
 * The mocked module is also required from Node afterwards, which reaches the registry's
 * memoized value: it must be the mock object, not the promise an async factory yields.
 */
import { describe, expect, it } from "vitest";
import { other, read } from "./fixtures/partial-mock/api";
import { store } from "./fixtures/partial-mock/store";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: any[]) => any>(impl: T): T;
  requireActual<T = any>(path: string): T;
  requireMock<T = any>(path: string): T;
};

jest.mock("./fixtures/partial-mock/api", () => ({
  ...jest.requireActual("./fixtures/partial-mock/api"),
  other: jest.fn(() => "mocked"),
}));

describe("a partial mock whose module is imported before the store", () => {
  it("reads the store the test writes", () => {
    store.value = "set-by-the-test";
    expect(other()).toBe("mocked");
    expect(read()).toBe("set-by-the-test");
  });

  it("is the mock object, not a promise, when Node requires it", () => {
    const required = require("./fixtures/partial-mock/api");
    expect(Object.prototype.toString.call(required)).toBe("[object Object]");
    expect(required.other).toBe(other);
    expect(required.read).toBe(read);
    expect(jest.requireMock("./fixtures/partial-mock/api")).toBe(required);
  });
});
