/**
 * A library's setup reached by `import` (a migrated suite's setup file, a `setupFiles`
 * entry) gets the same Jest semantics as one reached by `require`: the CommonJS loader
 * compiles the file without the request `Module._load` sees, so the package is activated
 * from the file itself (native/library-jest.mjs).
 */
import "vn-lib-jest-support/jestSetup.js";
import { createRequire } from "node:module";
import { expect, it } from "vitest";

it("mocks the library's native module for its own require of it", () => {
  expect(createRequire(import.meta.url)("vn-lib-jest-support").read()).toBe("mocked");
});
