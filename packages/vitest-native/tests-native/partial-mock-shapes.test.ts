/**
 * What a factory's `jest.requireActual` returns once jestMockTransform loads it through
 * `vi.importActual` (transform.ts): what Jest's would, whatever the module's shape.
 */
import { describe, expect, it } from "vitest";
import greet from "./fixtures/partial-mock/legacy/greet.js";
import { describeA, name } from "./fixtures/partial-mock/cycle-a";
import greeting, { named } from "./fixtures/partial-mock/with-default";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  fn<T extends (...args: any[]) => any>(impl: T): T;
  requireActual<T = any>(path: string): T;
};

// CommonJS that replaces module.exports: Jest's requireActual returns the function,
// where `vi.importActual` returns a namespace whose `default` holds it.
jest.mock("./fixtures/partial-mock/legacy/greet.js", () => {
  const actual = jest.requireActual("./fixtures/partial-mock/legacy/greet.js");
  return jest.fn((who: string) => `${actual(who)}!`);
});

// An ES module keeps its namespace, default export included, as babel-jest's output
// does; only CommonJS is unwrapped.
jest.mock("./fixtures/partial-mock/with-default", () => ({
  ...jest.requireActual("./fixtures/partial-mock/with-default"),
  named: "mocked",
}));

// The real module imports one that imports the mocked module back. Vitest gives that
// inner import the real module (its mocker's call stack: the factory is still running),
// where Jest would re-enter the factory until the stack overflowed; it must not hang.
jest.mock("./fixtures/partial-mock/cycle-a", () => ({
  ...jest.requireActual("./fixtures/partial-mock/cycle-a"),
  name: () => "mocked-a",
}));

describe("jest.requireActual inside a factory", () => {
  it("returns module.exports for a CommonJS module", () => {
    expect(greet("ada")).toBe("hello ada!");
  });

  it("returns the namespace of an ES module with a default export", () => {
    expect(greeting()).toBe("default");
    expect(named).toBe("mocked");
  });

  it("loads a module that imports the mocked one back", () => {
    expect(name()).toBe("mocked-a");
    expect(describeA()).toBe("a+b(a)");
  });
});
