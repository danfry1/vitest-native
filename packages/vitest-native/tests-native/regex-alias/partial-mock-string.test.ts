/**
 * A partial mock through a string `resolve.alias` (`@partial-mock-string`, set in
 * vitest.regex-alias.config.mts), the shape tsconfig `paths` migrate to. Node can be
 * given a string alias, so a synchronous requireActual loaded the real module, and its
 * store, as a second copy: the real `read` saw Node's store while the app wrote Vite's.
 * Under Jest, `requireActual` returns the one registry's module, so `read` sees the
 * app's write.
 */
import { describe, expect, it } from "vitest";
import { other, read } from "@partial-mock-string/api";
import { setValue } from "../fixtures/partial-mock/consumer";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: any[]) => any>(impl: T): T;
  requireActual<T = any>(path: string): T;
};

jest.mock("@partial-mock-string/api", () => ({
  ...jest.requireActual("@partial-mock-string/api"),
  other: jest.fn(() => "mocked"),
}));

describe("a partial mock through a string alias", () => {
  it("loads the real module and shares the app's store", () => {
    setValue("set-by-the-app");
    expect(other()).toBe("mocked");
    expect(read()).toBe("set-by-the-app");
  });
});
