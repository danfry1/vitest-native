// Aliased workspace source that uses import.meta.
import { expect, test } from "vitest";
import { metaUrlType } from "@m/feature/meta";

test("aliased source using import.meta loads", () => {
  expect(metaUrlType).toBe("string");
});
