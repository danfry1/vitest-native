// A CommonJS project file the test imported first: Node's require gets its module.exports.
import { expect, test } from "vitest";

test("CommonJS project source imported first is the module Node requires", async () => {
  const imported = await import("@m/validator/legacy");
  const required = require("@m/validator/legacy");
  expect(required, "one module.exports").toBe(imported.default);
});
