// Node requires a module while Vite is part-way through evaluating it, and not from inside
// that evaluation: its unfinished exports would be wrong, so the require fails by name,
// and the import still completes.
import { expect, test } from "vitest";
import { requireSlow } from "@m/feature";

test("a require of a module Vite is still evaluating, not in a cycle, fails by name", async () => {
  const worker = (globalThis as { __vitest_worker__?: any }).__vitest_worker__;
  const pending = import("@m/validator/slow");
  const file = `${process.cwd()}/packages/validator/src/slow.ts`.replace(/\\/g, "/");
  for (let i = 0; i < 10_000; i++) {
    const nodes = [...(worker.evaluatedModules.getModulesByFile(file) ?? [])];
    if (nodes.some((node: any) => node.promise && !node.evaluated)) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  expect(() => requireSlow()).toThrow(
    expect.objectContaining({ code: "REQUIRE_OF_EVALUATING_VITE_MODULE" }),
  );
  expect((await pending).v).toBe(4);
});
