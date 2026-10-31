// Symmetric twin of hot-automock-b: each mocks one of x/y with a factory and automocks
// the other. Under the hot runtime on Vitest 4.1, the module graph kept across files
// remembered the first file's factory and replayed it where the second asked for an
// automock. Symmetric, so the check holds whichever file runs first.
import { expect, test, vi } from "vitest";
import { owner as x } from "../src/hot-mock/x";
import { owner as y } from "../src/hot-mock/y";

vi.mock("../src/hot-mock/x", () => ({ owner: () => "factory-a" }));
vi.mock("../src/hot-mock/y");

test("gets its own factory, and an automock for the module it automocks", () => {
  expect(x()).toBe("factory-a");
  expect(vi.isMockFunction(y)).toBe(true);
  expect(y()).toBeUndefined();
});
