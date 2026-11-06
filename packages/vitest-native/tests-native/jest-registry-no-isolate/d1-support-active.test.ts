import { createRequire } from "node:module";
import { expect, test } from "vitest";

test("a support entry that registers no mock makes its package's support active (file 1)", () => {
  expect(createRequire(import.meta.url)("vn-lib-esm-support/jest/setup.cjs").sawJest).toBe(
    "object",
  );
});
