import { expect, test } from "vitest";
import { viaM } from "museum-esm-lib";

test("a default import across a cycle is the module's default once it is set", () => {
  expect(viaM()).toBe("a-default");
});
