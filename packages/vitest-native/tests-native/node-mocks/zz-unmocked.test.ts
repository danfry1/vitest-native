/**
 * No mock here: an installed package's require gets the real module. Under the hot
 * runtime this file runs last in the same worker as every file that mocked the module,
 * so a mock that outlived its file would reach it.
 */
import { expect, it } from "vitest";
import { importFrom, requireFrom } from "dispatch-consumer-lib";

it("gets the real module", () => {
  expect(requireFrom("dispatch-target-lib").source).toBe("real");
  expect(requireFrom("dispatch-split-lib").source).toBe("real (main)");
});

it("gets the real module through an installed ES module's import", async () => {
  const consumer = (await importFrom("dispatch-consumer-lib/esm-consumer.mjs")) as {
    seen: string;
  };
  expect(consumer.seen).toBe("real");
});
