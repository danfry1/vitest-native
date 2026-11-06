// A CommonJS project file, Node first: the import after it gets the same module.exports.
import { expect, test } from "vitest";
import { requireLegacy } from "@m/feature";

test("CommonJS project source required first is the module the test imports", async () => {
  const required = requireLegacy();
  const imported = await import("@m/validator/legacy");
  expect(typeof required, "Node gets module.exports").toBe("function");
  expect(imported.default, "one module.exports").toBe(required);
});
