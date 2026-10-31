import { expect, test } from "vitest";
import { callBoth } from "museum-esm-lib";

test("a default + named import of __esModule CommonJS gives module.exports as the default", () => {
  expect(callBoth()).toBe("extends-ok");
});
