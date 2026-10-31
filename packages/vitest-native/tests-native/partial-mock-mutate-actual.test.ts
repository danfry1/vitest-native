/**
 * A partial mock that mutates the actual module and returns it, a common Jest shape.
 * The real `read` must still see the app's store.
 */
import { describe, expect, it } from "vitest";
import { other, read } from "./fixtures/partial-mock/api";
import { setValue } from "./fixtures/partial-mock/consumer";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: any[]) => any>(impl: T): T;
  requireActual<T = any>(path: string): T;
};

jest.mock("./fixtures/partial-mock/api", () => {
  const actual = jest.requireActual("./fixtures/partial-mock/api");
  actual.other = jest.fn(() => "mocked");
  return actual;
});

describe("a partial mock that mutates the actual module", () => {
  it("reads what the app wrote", () => {
    setValue("set-by-the-app");
    expect(other()).toBe("mocked");
    expect(read()).toBe("set-by-the-app");
  });
});
