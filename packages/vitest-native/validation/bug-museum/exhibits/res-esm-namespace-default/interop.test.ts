import { expect, test } from "vitest";
import { callNamespace } from "museum-esm-lib";

test("a namespace import's default is module.exports", () => {
  expect(callNamespace()).toBe("extends-ok");
});
