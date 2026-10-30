import { expect, it, vi } from "vitest";
import { owner as x } from "./mock-meta-x";
import { owner as y } from "./mock-meta-y";
import { owner as z } from "./mock-meta-z";

// Symmetric twin of 14-mock-meta-a: see mock-meta-x.ts.
vi.mock("./mock-meta-x");
vi.mock("./mock-meta-y", () => ({ owner: () => "factory-b" }));
vi.mock("./mock-meta-z", () => ({ owner: () => "factory-b" }));

it("gets its own factories for the modules it mocks with one", () => {
  expect(y()).toBe("factory-b");
  expect(z()).toBe("factory-b");
});

it("gets an automock, not the other file's factory, for the module it automocks", () => {
  expect(vi.isMockFunction(x)).toBe(true);
  expect(vi.mocked(x).mock.calls).toEqual([]);
  expect(x()).toBeUndefined();
  vi.mocked(x).mockReturnValue("set-in-b");
  expect(x()).toBe("set-in-b");
});
