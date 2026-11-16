import { expect, it } from "vitest";

type Loose = Record<string, (...args: unknown[]) => unknown>;

// One of two files on one hot worker, in either order. expect.extend and
// expect.addEqualityTesters write to objects Vitest keeps for the worker: each file must
// start with only what its setup files add, as it does under Jest (#808).
it("starts with no matcher or equality tester an earlier file added, then adds both", () => {
  expect(() => (expect(1) as unknown as Loose).toBeHotLeak()).toThrow();
  expect((expect as unknown as Loose).toBeHotLeak).toBeUndefined();
  expect(1).not.toEqual(2);

  expect.extend({ toBeHotLeak: () => ({ pass: true, message: () => "" }) });
  expect.addEqualityTesters([
    (a, b) => (typeof a === "number" && typeof b === "number" ? true : undefined),
  ]);
  (expect(1) as unknown as Loose).toBeHotLeak();
  expect(1).toEqual(2);
});
