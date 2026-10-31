/**
 * A partial mock through a regex `resolve.alias` (`^@partial-mock/(.*)$`, set in
 * vitest.regex-alias.config.mts), the shape Jest's `moduleNameMapper` migrates to. A synchronous
 * requireActual resolves through Node, which can only be given string aliases, so this
 * threw REQUIRE_ACTUAL_ALIAS_UNSUPPORTED; through Vite the alias applies as it does to
 * the imports.
 */
import { describe, expect, it } from "vitest";
import { other, read } from "@partial-mock/api";
import { setValue } from "../fixtures/partial-mock/consumer";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: any[]) => any>(impl: T): T;
  requireActual<T = any>(path: string): T;
};

jest.mock("@partial-mock/api", () => ({
  ...jest.requireActual("@partial-mock/api"),
  other: jest.fn(() => "mocked"),
}));

describe("a partial mock through a regex alias", () => {
  it("loads the real module and shares the app's store", () => {
    setValue("set-by-the-app");
    expect(other()).toBe("mocked");
    expect(read()).toBe("set-by-the-app");
  });
});
