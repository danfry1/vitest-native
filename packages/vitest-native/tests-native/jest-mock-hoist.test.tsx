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

// (4) ASYNC factory. Not a Jest idiom — Jest never awaits a factory — but the shape a
// partially-migrated suite reaches for, and one Vitest supports. The interop wrapper
// received the promise itself, which has no own enumerable keys and no `default`, so
// it produced `{ default: Promise }`: every named export disappeared and Vitest
// reported `No "readSetting" export is defined on the mock`, naming a vi.mock the
// author never wrote.
// Deliberately no `jest.requireActual` here: relative requireActual resolution is a
// separate change, and pairing the two would make this case untestable without it.
// Worth revisiting once that lands — a hoisted factory's call stack need not contain
// the test file, which is what caller-relative resolution depends on.
jest.mock("./fixtures/settings-store", async () => ({
  readSetting: () => "async-read",
  writeSetting: () => "mocked-write",
}));

// (5) A factory that returns a promise without being declared async — the same
// failure, undetectable from the AST, so the fix has to be at run time.
jest.mock("./fixtures/greeter2", () => Promise.resolve({ greet: () => "promised-hello" }));

import { greet } from "./fixtures/greeter";
import Widget from "./fixtures/widget";
import api from "./fixtures/api";
import { readSetting, writeSetting } from "./fixtures/settings-store";
import { greet as greet2 } from "./fixtures/greeter2";

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

  it("an async factory keeps its named exports", () => {
    expect(writeSetting()).toBe("mocked-write");
    expect(readSetting()).toBe("async-read");
  });

  it("a factory returning a promise resolves the same way", () => {
    expect(greet2()).toBe("promised-hello");
  });
});
