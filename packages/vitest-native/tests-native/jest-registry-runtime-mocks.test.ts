/**
 * The non-hoisted mock members reach Node's `require` as well as imports. In
 * jest-runtime they all write one registry: `setMock` is `setMockFactory(name, () =>
 * mock)`, `doMock` is `setMock` with the factory, and `unmock`/`dontMock` set
 * `_explicitShouldMock` to false for the module.
 */
import { describe, expect, it } from "vitest";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  unmock(path: string): void;
  doMock(path: string, factory: () => unknown): void;
  doUnmock(path: string): void;
  setMock(path: string, exports: unknown): void;
  dontMock(path: string): void;
};

const STORAGE = "./fixtures/alias-app/registry/storage";

jest.mock("@vn-app/registry/sentry", () => ({ Sentry: "mocked" }));
jest.unmock("@vn-app/registry/sentry");

describe("runtime mock members and require()", () => {
  it("jest.unmock removes the mock a jest.mock registered", () => {
    expect(typeof require("@vn-app/registry/sentry").Sentry.startInactiveSpan).toBe("function");
  });

  it("jest.doMock applies to the next require, and jest.doUnmock removes it", () => {
    jest.doMock(STORAGE, () => ({ device: { get: () => "do-mocked" } }));
    expect(require(STORAGE).device.get("k")).toBe("do-mocked");
    jest.doUnmock(STORAGE);
    expect(require(STORAGE).device.get("k")).toBe("real-storage:k");
  });

  it("jest.setMock applies to the next require, and jest.dontMock removes it", () => {
    const exports = { device: { get: () => "set-mocked" } };
    jest.setMock(STORAGE, exports);
    expect(require(STORAGE)).toBe(exports);
    jest.dontMock(STORAGE);
    expect(require(STORAGE).device.get("k")).toBe("real-storage:k");
  });
});
