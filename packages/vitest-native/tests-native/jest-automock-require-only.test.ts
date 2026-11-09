/**
 * #621: a file that only require()s a package it mocks without a factory (no import) gets
 * the automock too, as under Jest, and an installed package's require gets the same one.
 */
import { expect, it } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

declare const jest: { mock(path: string): void; isMockFunction(value: unknown): boolean };
declare const require: (id: string) => Record<string, unknown>;

jest.mock("dispatch-target-lib");

it("automocks a require() with no import before it", () => {
  const required = require("dispatch-target-lib");
  expect(jest.isMockFunction(required.fn)).toBe(true);
  expect(requireFrom("dispatch-target-lib").fn).toBe(required.fn);
});
