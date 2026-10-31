/** A partial mock built with Object.assign over the actual module. */
import { describe, expect, it } from "vitest";
import { other, read } from "./fixtures/partial-mock/api";
import { setValue } from "./fixtures/partial-mock/consumer";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: any[]) => any>(impl: T): T;
  requireActual<T = any>(path: string): T;
};

jest.mock("./fixtures/partial-mock/api", () =>
  Object.assign({}, jest.requireActual("./fixtures/partial-mock/api"), {
    other: jest.fn(() => "mocked"),
  }),
);

describe("a partial mock built with Object.assign", () => {
  it("reads what the app wrote", () => {
    setValue("set-by-the-app");
    expect(other()).toBe("mocked");
    expect(read()).toBe("set-by-the-app");
  });
});
