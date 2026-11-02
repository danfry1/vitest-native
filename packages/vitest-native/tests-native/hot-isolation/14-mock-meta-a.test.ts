import { expect, it, vi } from "vitest";
import { owner as x } from "./mock-meta-x";
import { owner as y } from "./mock-meta-y";
import { owner as z } from "./mock-meta-z";

// Symmetric twin of 15-mock-meta-b: see mock-meta-x.ts.
vi.mock("./mock-meta-x", () => ({ owner: () => "factory-a" }));
vi.mock("./mock-meta-y");
vi.mock("./mock-meta-z", () => ({ owner: () => "factory-a" }));

it("gets its own factories for the modules it mocks with one", () => {
  expect(x()).toBe("factory-a");
  expect(z()).toBe("factory-a");
});

it("gets an automock, not the other file's factory, for the module it automocks", () => {
  expect(vi.isMockFunction(y)).toBe(true);
  expect(vi.mocked(y).mock.calls).toEqual([]);
  expect(y()).toBeUndefined();
  vi.mocked(y).mockReturnValue("set-in-a");
  expect(y()).toBe("set-in-a");
});
