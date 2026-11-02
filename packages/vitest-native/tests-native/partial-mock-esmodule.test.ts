/**
 * The actual module a factory reads carries `__esModule`, as require() of an ES module
 * does under babel-jest, so a factory spreading it into a mock keeps ES interop.
 */
import { describe, expect, it } from "vitest";
import * as api from "./fixtures/partial-mock/api";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: any[]) => any>(impl: T): T;
  requireActual<T = any>(path: string): T;
};

jest.mock("./fixtures/partial-mock/api", () => {
  const actual = jest.requireActual("./fixtures/partial-mock/api");
  return { ...actual, actualEsModule: actual.__esModule, other: jest.fn(() => "mocked") };
});

describe("the actual module's ES interop", () => {
  it("has __esModule, and the mock keeps the real members", () => {
    const mocked = api as typeof api & { actualEsModule: unknown };
    expect(mocked.other()).toBe("mocked");
    expect(mocked.read()).toBeNull();
    expect(mocked.actualEsModule).toBe(true);
  });
});
