/**
 * `jest.requireActual('../x')` resolves against the CALLING module under Jest.
 *
 * The compat shim backed it with a single `createRequire` anchored at the project
 * root, so bare specifiers worked and relative ones escaped the source tree:
 * MODULE_NOT_FOUND, with a requireStack pointing at <projectRoot>/package.json —
 * a confusing place to be sent when the file sits beside the test. Reported from a
 * real migration, where it broke five files until they shimmed around it.
 */
import { expect, it } from "vitest";

declare const jest: { requireActual: (m: string) => Record<string, unknown> };

it("resolves a relative specifier against the calling file", () => {
  expect(jest.requireActual("./require-actual-sibling.cjs").marker).toBe("sibling-of-the-test");
});

it("still resolves bare specifiers from the project", () => {
  expect(typeof jest.requireActual("react")).toBe("object");
});

it("reports a genuine miss rather than resolving something else", () => {
  // Falling back to the project root on a caller-relative miss could resolve an
  // unrelated file that happens to sit at the same relative path.
  expect(() => jest.requireActual("./definitely-not-here.cjs")).toThrow();
});
