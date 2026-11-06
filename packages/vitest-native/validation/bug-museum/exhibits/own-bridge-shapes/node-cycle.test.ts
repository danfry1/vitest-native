// Node requires a module back while Vite evaluates it (it imports the Node-loaded library
// that requires it): a cycle, so Node gets its exports so far, as in Node and Jest.
import { expect, test } from "vitest";

test("a require back into a module Vite is evaluating gets its exports so far", async () => {
  const back = await import("@m/validator/back");
  expect(back.seenFromNode, "the exports so far").toBe("first");
});
