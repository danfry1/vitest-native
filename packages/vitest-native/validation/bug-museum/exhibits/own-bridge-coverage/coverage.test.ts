// Node requires the module first, then the test imports it: one module, and its coverage
// is recorded (check.mjs reads the report).
import { expect, test } from "vitest";
import { requireCovered } from "@m/feature";

test("project source Node required first runs once, and is covered", async () => {
  const required = requireCovered();
  const imported = await import("@m/validator/covered");
  expect(required.picked).toBe("taken");
  expect(imported.pick).toBe(required.pick);
});
