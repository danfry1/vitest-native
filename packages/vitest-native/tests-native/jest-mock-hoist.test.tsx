import { describe, expect, it } from "vitest";

// Top-level `jest.mock(...)` exactly as written in existing Jest suites. The
// jestMockTransform plugin (1) rewrites these to hoisted `vi.mock` so they apply
// to the imports below, and (2) runs each factory's return through Jest's CJS
// interop so the common manual-mock shapes resolve the way Jest resolves them.
declare const jest: { mock(path: string, factory: () => unknown): void };

// (1) Named export, named import — basic hoisting.
jest.mock("./fixtures/greeter", () => ({ greet: () => "mocked-hello" }));

// (2) Function factory (returns a function), consumed as a DEFAULT import. Under
// plain Vitest this errors ("not returning an object"); Jest exposes the function
// as the default export.
jest.mock("./fixtures/widget", () => () => "mocked-widget");

// (3) Named-only object, consumed as a DEFAULT import. Jest makes the whole
// exports object the default; plain Vitest would give `undefined`.
jest.mock("./fixtures/api", () => ({ get: () => "mocked-get" }));

import { greet } from "./fixtures/greeter";
import Widget from "./fixtures/widget";
import api from "./fixtures/api";

describe("jest.mock hoisting + CJS interop (jestMockTransform)", () => {
  it("applies a top-level jest.mock to a module imported below it", () => {
    expect(greet()).toBe("mocked-hello");
  });

  it("a function-returning factory is exposed as the default export", () => {
    expect(typeof Widget).toBe("function");
    expect((Widget as unknown as () => string)()).toBe("mocked-widget");
  });

  it("a named-only factory return is usable via the default import (Jest CJS interop)", () => {
    expect((api as { get: () => string }).get()).toBe("mocked-get");
  });
});
