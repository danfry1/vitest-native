// See hot-automock-a.
import { expect, test, vi } from "vitest";
import { owner as x } from "../src/hot-mock/x";
import { owner as y } from "../src/hot-mock/y";

vi.mock("../src/hot-mock/x");
vi.mock("../src/hot-mock/y", () => ({ owner: () => "factory-b" }));

test("gets its own factory, and an automock for the module it automocks", () => {
  expect(y()).toBe("factory-b");
  expect(vi.isMockFunction(x)).toBe(true);
  expect(x()).toBeUndefined();
});
