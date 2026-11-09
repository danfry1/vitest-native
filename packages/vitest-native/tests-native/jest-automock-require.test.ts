/**
 * A factory-less jest.mock of a package with no manual mock automocks it for every load in
 * the file, as under Jest (#621): the test's import, its require(), and the require of an
 * installed package. One instance serves them all.
 */
import { expect, it } from "vitest";
import * as target from "dispatch-target-lib";
import { requireFrom } from "dispatch-consumer-lib";

declare const jest: { mock(path: string): void; isMockFunction(value: unknown): boolean };
declare const require: (id: string) => Record<string, unknown>;

jest.mock("dispatch-target-lib");

it("automocks the test's import", () => {
  expect(jest.isMockFunction(target.fn)).toBe(true);
});

it("serves the same automock to the test's require()", () => {
  const required = require("dispatch-target-lib");
  expect(jest.isMockFunction(required.fn)).toBe(true);
  expect(required.fn).toBe(target.fn);
});

it("serves it to an installed package's require", () => {
  expect(requireFrom("dispatch-target-lib").fn).toBe(target.fn);
});

it("keeps the module's plain values, as an automock does", () => {
  expect(require("dispatch-target-lib").source).toBe("real");
});
