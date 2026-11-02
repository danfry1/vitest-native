// The worker count Vitest resolved for this project.
import { expect, inject, test } from "vitest";

test("an explicit maxWorkers is honoured", () => {
  expect(inject("maxWorkers")).toBe(6);
});
