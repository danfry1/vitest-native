// Each file mocks one of x/y with a factory and automocks the other (symmetric twin).
import { expect, test, vi } from "vitest";
import { owner as x } from "./src/x";
import { owner as y } from "./src/y";

vi.mock("./src/x", () => ({ owner: () => "factory-a" }));
vi.mock("./src/y");

test("gets its own factory, and an automock for the module it automocks", () => {
  expect(x()).toBe("factory-a");
  expect(vi.isMockFunction(y)).toBe(true);
  expect(y()).toBeUndefined();
});
