// Top-level for await is refused before the module runs: it leaves no partial evaluation,
// and a later import runs it once.
import { expect, test } from "vitest";
import { requireForAwait } from "@m/feature";

test("top-level for await fails by name and does not run the module", async () => {
  expect(() => requireForAwait()).toThrow(
    expect.objectContaining({ code: "REQUIRE_OF_ASYNC_VITE_MODULE" }),
  );
  expect((globalThis as { __forAwaitRuns?: number }).__forAwaitRuns).toBeUndefined();
  expect((await import("@m/validator/for-await")).seen).toEqual([1, 2]);
  expect((globalThis as { __forAwaitRuns?: number }).__forAwaitRuns).toBe(1);
});
