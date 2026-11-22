// A CommonJS require() of @jest/globals gets jest-compat's shim, as an import does through
// jestCompatAliases(). The real package throws outside Jest; it is not installed here, so
// without the shim this file fails to load with "Cannot find module '@jest/globals'".
const globals = require("@jest/globals");
import * as imported from "@jest/globals";

test("require('@jest/globals') is the module an import gets", () => {
  expect(globals.expect).toBe(imported.expect);
  expect(globals.jest).toBe(imported.jest);
  expect(globals.jest).toBe(jest);
  expect(typeof globals.describe).toBe("function");
});
