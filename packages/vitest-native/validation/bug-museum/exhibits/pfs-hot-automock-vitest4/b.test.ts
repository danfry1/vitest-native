// Each file mocks one of x/y with a factory and automocks the other (symmetric twin).
import { expect, test, vi } from "vitest";
import { owner as x } from "./src/x";
import { owner as y } from "./src/y";

vi.mock("./src/y", () => ({ owner: () => "factory-b" }));
vi.mock("./src/x");

test("gets its own factory, and an automock for the module it automocks", () => {
  expect(y()).toBe("factory-b");
  expect(vi.isMockFunction(x)).toBe(true);
  expect(x()).toBeUndefined();
});
