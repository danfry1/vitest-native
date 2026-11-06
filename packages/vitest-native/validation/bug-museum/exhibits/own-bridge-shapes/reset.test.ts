// The test requires the store, resets the module registry, then imports and requires it:
// the two after the reset are one instance.
import { expect, test, vi } from "vitest";

test("after vi.resetModules, an import and a require agree", async () => {
  require("@m/validator/store");
  vi.resetModules();
  const imported = await import("@m/validator/store");
  const required = require("@m/validator/store");
  expect(imported.store, "one store after the reset").toBe(required.store);
});
