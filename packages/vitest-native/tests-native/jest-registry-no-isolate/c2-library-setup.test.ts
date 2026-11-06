import { createRequire } from "node:module";
import { expect, test } from "vitest";

test("a library's jestSetup imported by a setup file mocks its native module (file 2)", () => {
  expect(createRequire(import.meta.url)("vn-lib-jest-support/NativeThing.js").read()).toBe(
    "mocked",
  );
});
