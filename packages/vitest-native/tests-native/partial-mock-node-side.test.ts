/**
 * Node-side loads of a module whose factory jestMockTransform made async (transform.ts).
 * Node's `require` cannot wait for a promise, so the registry keeps the synchronous
 * original for a load that comes first, and refuses one that comes while the async
 * factory is still loading the real module (node-registry.mjs, `valueOf`).
 */
import { describe, expect, it } from "vitest";
import { attempt, real } from "./fixtures/partial-mock/requires-back";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  requireActual<T = any>(path: string): T;
  requireMock<T = any>(path: string): T;
};

jest.mock("./fixtures/partial-mock/node-only", () => ({
  ...jest.requireActual("./fixtures/partial-mock/node-only"),
  replaced: () => "mocked",
}));
jest.mock("./fixtures/partial-mock/requires-back", () => ({
  ...jest.requireActual("./fixtures/partial-mock/requires-back"),
  real: () => "mocked",
}));

describe("a module the test file never imports", () => {
  it("is the mock when only Node loads it", () => {
    const required = require("./fixtures/partial-mock/node-only");
    expect(required.replaced()).toBe("mocked");
    expect(required.real()).toBe("real");
    expect(jest.requireMock("./fixtures/partial-mock/node-only")).toBe(required);
  });
});

describe("a module required back while its factory loads it", () => {
  it("is refused with the cycle named, instead of handing Node a promise", () => {
    expect(real()).toBe("mocked");
    expect(attempt.value).toBeUndefined();
    expect(attempt.error?.code).toBe("JEST_MOCK_FACTORY_CYCLE");
    expect(attempt.error?.message).toContain("requires the mocked module back");
  });
});
