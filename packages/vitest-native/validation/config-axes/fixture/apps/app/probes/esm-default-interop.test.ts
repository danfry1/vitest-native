// An installed ES-module package default-importing CommonJS that sets __esModule and has
// no default (tslib's ESM wrapper). Node gives the import module.exports; Babel's interop
// gave undefined: "Cannot read properties of undefined (reading '__extends')".
import { expect, test } from "vitest";
import { callExtends } from "axis-esm-lib";

test("a default import of __esModule CommonJS without a default is module.exports", () => {
  expect(callExtends()).toBe("extends-ok");
});
