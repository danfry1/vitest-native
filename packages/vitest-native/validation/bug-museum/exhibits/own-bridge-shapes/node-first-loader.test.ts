// A Node-loaded helper first loaded by the test, then called by sx while it evaluates,
// requires sx back: a cycle by who calls it now, whoever loaded the helper first.
import { createRequire } from "node:module";
import { expect, test } from "vitest";

test("a cycle through a helper something else loaded first gets the exports so far", async () => {
  createRequire(`${process.cwd()}/package.json`)(`${process.cwd()}/packages/feature/src/shared.js`);
  const sx = await import("@m/validator/sx");
  expect(sx.seen, "the exports so far, through a shared helper").toBe("first");
});
