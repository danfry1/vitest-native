// A deeper cycle: while Vite evaluates fn-x, the library it imports requires fn-y (the
// bridge evaluates it), whose Node-loaded import requires fn-x back: its exports so far.
import { expect, test } from "vitest";

test("a cycle through a bridged module and a second Node-loaded file gets the exports so far", async () => {
  const x = await import("@m/validator/fn-x");
  expect(x.seen, "the exports so far, two hops deep").toBe("x");
});
