import { expect, test } from "vitest";

test("a rejected actual is not retained", async () => {
  globalThis.__selective_repro_fail_flaky = true;
  await expect(import("./resident-flaky.mjs")).rejects.toThrow(
    "intentional first evaluation failure",
  );
  expect(globalThis.__selective_repro_flaky_evaluations).toBe(1);
});
