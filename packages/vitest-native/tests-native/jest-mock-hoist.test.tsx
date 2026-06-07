import { describe, expect, it } from "vitest";

// A top-level `jest.mock(...)` exactly as written in an existing Jest suite. The
// jestMockTransform plugin rewrites it to a hoisted `vi.mock`, so it must apply
// to the import BELOW it. Without the transform this is a silent no-op (Vitest
// only hoists `vi`/`vitest` mock calls), and greet() would return "real-hello".
declare const jest: { mock(path: string, factory: () => unknown): void };
jest.mock("./fixtures/greeter", () => ({ greet: () => "mocked-hello" }));

import { greet } from "./fixtures/greeter";

describe("jest.mock hoisting (jestMockTransform)", () => {
  it("applies a top-level jest.mock to a module imported below it", () => {
    expect(greet()).toBe("mocked-hello");
  });
});
