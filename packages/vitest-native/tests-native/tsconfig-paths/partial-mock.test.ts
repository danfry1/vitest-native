/**
 * A partial mock through `resolve.tsconfigPaths` (`~partial-mock/*` in this directory's
 * tsconfig.json). A synchronous requireActual loaded the real module, and its store, as
 * a second copy through Node; under Jest, `requireActual` returns the one registry's
 * module, so the real `read` sees the app's write.
 */
import { describe, expect, it } from "vitest";
import { other, read } from "~partial-mock/api";
import { setValue } from "~partial-mock/consumer";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: any[]) => any>(impl: T): T;
  requireActual<T = any>(path: string): T;
};

jest.mock("~partial-mock/api", () => ({
  ...jest.requireActual("~partial-mock/api"),
  other: jest.fn(() => "mocked"),
}));

describe("a partial mock through tsconfig paths", () => {
  it("loads the real module and shares the app's store", () => {
    setValue("set-by-the-app");
    expect(other()).toBe("mocked");
    expect(read()).toBe("set-by-the-app");
  });
});
