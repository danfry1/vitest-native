import { expect, test } from "vitest";

test("the rejected actual can evaluate in the next file", async () => {
  const actual = await import("./resident-flaky.mjs");
  expect(actual.evaluation).toBe(2);
  expect(globalThis.__selective_repro_flaky_evaluations).toBe(2);
});
