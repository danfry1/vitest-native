/**
 * The jest-compat shim finds the calling test file from the stack, skipping its own
 * frames. It used to skip any frame whose path contained `/jest-compat/`, so a test
 * file in a directory of that name was skipped too, and relative specifiers resolved
 * against the wrong file. This file lives in such a directory on purpose.
 */
import { expect, it } from "vitest";

declare const jest: { requireActual: (m: string) => Record<string, unknown> };

it("resolves a relative specifier against a caller inside a `jest-compat/` directory", () => {
  expect(jest.requireActual("./sibling.cjs").marker).toBe("sibling-under-a-jest-compat-dir");
});
