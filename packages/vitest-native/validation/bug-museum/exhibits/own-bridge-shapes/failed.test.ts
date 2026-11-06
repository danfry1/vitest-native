// A required module throws while it is evaluated: the require fails by name with the
// module's error as the cause, and nothing half-built is left for the next load.
import { expect, test } from "vitest";
import { requireBoom } from "@m/feature";

const evals = () => (globalThis as { __boomEvals?: number }).__boomEvals ?? 0;

test("a module that throws for a require fails by name, with its error as the cause", async () => {
  let caught: any;
  try {
    requireBoom();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code: "BRIDGED_EVALUATION_FAILED" });
  // The module's own error is attached when the evaluator's promise settles: before
  // anything reports the require's error, which is after this task.
  await new Promise((resolve) => setTimeout(resolve));
  expect(caught.cause?.message).toBe("boom-original");
  // Invalidated: a later import evaluates it afresh, and fails the same way.
  await expect(import("@m/validator/boom")).rejects.toThrow(/boom-original/);
  expect(evals()).toBe(2);
});

test("a require of a module Vite failed to evaluate fails too, not half-built", async () => {
  await expect(import("@m/validator/boom")).rejects.toThrow(/boom-original/);
  const before = evals();
  expect(() => requireBoom()).toThrow(
    expect.objectContaining({ code: "BRIDGED_EVALUATION_FAILED" }),
  );
  expect(evals()).toBe(before);
});
