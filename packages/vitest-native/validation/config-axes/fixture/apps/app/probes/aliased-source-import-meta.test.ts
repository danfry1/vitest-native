// Aliased workspace source that uses import.meta is a SyntaxError once Node, not Vite,
// loads it.
import { expect, test } from "vitest";
import { metaUrlType } from "@axis/feature/meta";

test("aliased source using import.meta loads", () => {
  expect(metaUrlType).toBe("string");
});
