import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { errorsWithMethodsEquality } from "../src/jest-compat/error-equality.mjs";

// Vitest runs every registered tester on every pair it compares, so the jest-compat
// error tester sits on the path of each primitive and plain object in a large
// `toEqual`. It must leave a pair that is not two objects before any Error check.
// Its `isError` calls `Error.isError` where one exists, so a stand-in counts the checks;
// assigning one also works on Node versions without it.
// The stand-in is removed before any assertion, since Vitest's own comparison calls
// `Error.isError` too.
describe("errorsWithMethodsEquality fast path", () => {
  const original = Object.getOwnPropertyDescriptor(Error, "isError");
  const restore = () => {
    if (original) Object.defineProperty(Error, "isError", original);
    else delete (Error as { isError?: unknown }).isError;
  };
  afterEach(restore);

  const context = { equals: () => true };
  const pairs = (isError: (value: unknown) => boolean, values: Array<[unknown, unknown]>) => {
    (Error as { isError?: unknown }).isError = isError;
    try {
      return values.map(([a, b]) => errorsWithMethodsEquality.call(context, a, b, []));
    } finally {
      restore();
    }
  };

  it("leaves primitives and null without checking for an Error", () => {
    const isError = vi.fn(() => false);
    const results = pairs(isError, [
      [1, 1],
      ["a", "b"],
      [null, null],
      [undefined, {}],
      [{}, 2],
      [Symbol.iterator, Symbol.iterator],
    ]);
    expect(results).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(isError).not.toHaveBeenCalled();
  });

  it("still checks two objects", () => {
    const isError = vi.fn(() => false);
    expect(pairs(isError, [[{ a: 1 }, { a: 1 }]])).toEqual([undefined]);
    expect(isError).toHaveBeenCalled();
  });
});
