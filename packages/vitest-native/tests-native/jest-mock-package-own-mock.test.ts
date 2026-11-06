/**
 * The same line for a package Node's loader serves (not a library registry): the mock's
 * relative import of the package's entry gets the real module, not the mock it is
 * building (jest-compat/node-registry.mjs, isPackageOwnRelativeLoad).
 */
import { expect, it } from "vitest";
import * as lib from "vn-lib-own-mock";

declare const jest: { mock(path: string, factory: () => unknown): void };

jest.mock("vn-lib-own-mock", () => require("vn-lib-own-mock/src/mock"));

it("loads, and is the mock built on the real module", () => {
  expect((lib as unknown as { mocked: boolean }).mocked).toBe(true);
  expect(lib.fn()).toBe("real fn");
});

it("gives the package's other relative requires of that entry the real module, as Jest", () => {
  // Jest mocks `main` (lib/index.js); `./index` from src/ is src/index.js, the real one.
  const viaFeature = require("vn-lib-own-mock/src/feature")() as { mocked?: boolean };
  expect(viaFeature.mocked).toBeUndefined();
});
