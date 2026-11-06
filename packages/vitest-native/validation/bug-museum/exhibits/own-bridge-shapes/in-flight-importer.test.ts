// A require from the test body while Vite evaluates a module that imports the requiring
// library (it is waiting on a top-level await): not from inside that evaluation, so it
// fails by name, though the library is in the module's graph.
import { expect, test } from "vitest";
import { requireFpX } from "@m/feature";

test("a require from outside the evaluation fails by name, even from a library it imports", async () => {
  const worker = (globalThis as { __vitest_worker__?: any }).__vitest_worker__;
  const pending = import("@m/validator/fp-x");
  const file = `${process.cwd()}/packages/validator/src/fp-x.ts`.replace(/\\/g, "/");
  for (let i = 0; i < 10_000; i++) {
    const nodes = [...(worker.evaluatedModules.getModulesByFile(file) ?? [])];
    if (nodes.some((node: any) => node.promise && !node.evaluated)) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  expect(() => requireFpX(), "refused from outside the evaluation").toThrow(
    expect.objectContaining({ code: "REQUIRE_OF_EVALUATING_VITE_MODULE" }),
  );
  expect((await pending).ready).toBe("ready1function");
});
