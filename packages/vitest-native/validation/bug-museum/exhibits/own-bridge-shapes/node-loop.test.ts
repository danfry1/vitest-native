// While Vite evaluates loop-x, a Node-loaded library it imports requires loop-y, which the
// bridge evaluates; loop-y imports loop-x back. A cycle across the two module systems, so
// loop-y gets loop-x's exports so far, and loop-y is one module afterwards.
import { expect, test } from "vitest";

test("a bridged module importing back into the evaluation that required it gets its exports so far", async () => {
  const x = await import("@m/validator/loop-x");
  expect(x.seenThroughY, "the exports so far, through the bridge").toBe("x");
  const y = await import("@m/validator/loop-y");
  expect(y.fromX).toBe("x");
});
