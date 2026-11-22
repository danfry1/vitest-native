/**
 * A jest.mock factory's `require` of a module the file mocks WITHOUT a factory: Jest's
 * registry serves the manual mock (`__mocks__/helper.ts`), so the factory gets it too.
 * jestMockTransform loads such a require with `import()` (transform.ts), where Vitest's
 * own mocks apply; `vi.importActual` would hand it the real module. Run by the main
 * native config and, with experimental.nodeMocks, by the jest-registry node-mocks one.
 */
import { expect, it } from "vitest";
import { read } from "./fixtures/factory-require/api";

declare const jest: { mock(path: string, factory?: () => unknown): void };

jest.mock("./fixtures/factory-require/helper");
jest.mock("./fixtures/factory-require/api", () => {
  const helper = require("./fixtures/factory-require/helper");
  return { read: () => helper.name, flag: "unused" };
});

it("gets the manual mock of a module mocked without a factory", () => {
  expect(read()).toBe("manual-mock");
});
