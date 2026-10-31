/**
 * A partial mock of project source whose real members read a store the test never
 * imports: only app code (`consumer`) reaches it. A synchronous requireActual gave the
 * real `read` Node's copy of the store, and `setValue` wrote Vite's (see
 * partial-mock-mocked-first.test.ts).
 */
import { describe, expect, it } from "vitest";
import { other, read } from "./fixtures/partial-mock/api";
import { setValue } from "./fixtures/partial-mock/consumer";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: any[]) => any>(impl: T): T;
  requireActual<T = any>(path: string): T;
};

jest.mock("./fixtures/partial-mock/api", () => ({
  ...jest.requireActual("./fixtures/partial-mock/api"),
  other: jest.fn(() => "mocked"),
}));

describe("a partial mock whose store only app code reaches", () => {
  it("reads what the app wrote", () => {
    setValue("set-by-the-app");
    expect(other()).toBe("mocked");
    expect(read()).toBe("set-by-the-app");
  });
});
