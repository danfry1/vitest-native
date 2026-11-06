/**
 * An automock of an ES module package whose files import its entry back: while Vitest
 * loads the original to build the automock, that import is the real entry, in progress,
 * not a mock (R1). The test's import then gets the automock.
 */
import { expect, it, vi } from "vitest";
import * as lib from "dispatch-cycle-lib";
import { importFrom } from "dispatch-consumer-lib";

vi.mock("dispatch-cycle-lib");

it("builds the automock through the cycle", () => {
  expect(vi.isMockFunction(lib.fn)).toBe(true);
  expect(vi.isMockFunction(lib.helper)).toBe(true);
});

it("serves the built automock to a later import from Node, not the original's", async () => {
  const viaNode = (await importFrom("dispatch-cycle-lib")) as typeof lib;
  expect(viaNode.fn).toBe(lib.fn);
});
