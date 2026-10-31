import { expect, test } from "vitest";
import { callExtends } from "museum-esm-lib";

test("a default import of __esModule CommonJS without a default is module.exports", () => {
  expect(callExtends()).toBe("extends-ok");
});
