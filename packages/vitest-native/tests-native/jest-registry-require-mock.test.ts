/**
 * `jest.requireMock(spec)` returns the module `jest.mock(spec, factory)` registered:
 * `Runtime.requireMock` calls the factory once and caches the result in
 * `_mockRegistry`, so every consumer in the file shares it (jest-runtime 29.7).
 *
 * From a production app: `const { Sentry } = jest.requireMock('…/sentry/lib')`, then
 * an assertion on `Sentry.startInactiveSpan`. The compat layer returned the ACTUAL
 * module there, so the assertion ran against a function that was not a mock.
 */
import { describe, expect, it } from "vitest";
import { trace } from "./fixtures/alias-app/registry/tracing";
import { Sentry } from "./fixtures/alias-app/registry/sentry";

declare const jest: {
  mock(path: string, factory?: () => unknown, options?: { virtual?: boolean }): void;
  fn<T extends (...args: any[]) => any>(impl?: T): T & { mock: { calls: unknown[][] } };
  isMockFunction(value: unknown): boolean;
  requireMock<T = any>(path: string): T;
  requireActual<T = any>(path: string): T;
};

jest.mock("./fixtures/alias-app/registry/sentry", () => ({
  Sentry: { startInactiveSpan: jest.fn(() => "mocked-span") },
}));
jest.mock("vn-virtual-module", () => ({ isVirtual: true }), { virtual: true });
jest.mock("./fixtures/alias-app/registry/counter");

describe("jest.requireMock", () => {
  it("returns the registered mock, not the module", () => {
    const { Sentry: required } = jest.requireMock("./fixtures/alias-app/registry/sentry");
    expect(jest.isMockFunction(required.startInactiveSpan)).toBe(true);
  });

  it("returns the same object the file's imports see", () => {
    const { Sentry: required } = jest.requireMock("./fixtures/alias-app/registry/sentry");
    expect(required).toBe(Sentry);
    expect(trace("load")).toBe("mocked-span");
    expect(required.startInactiveSpan).toHaveBeenCalledWith("load");
  });

  it("resolves an aliased specifier to the same registration", () => {
    expect(jest.requireMock("@vn-app/registry/sentry")).toBe(
      jest.requireMock("./fixtures/alias-app/registry/sentry"),
    );
  });

  it("is what require() returns", () => {
    expect(require("./fixtures/alias-app/registry/sentry")).toBe(
      jest.requireMock("./fixtures/alias-app/registry/sentry"),
    );
  });

  it("serves a mock of a module that does not exist (Jest's virtual mock)", () => {
    expect(require("vn-virtual-module").isVirtual).toBe(true);
    expect(jest.requireMock("vn-virtual-module")).toBe(require("vn-virtual-module"));
    // There is no real module behind it: Jest's requireActual reports it missing.
    expect(() => jest.requireActual("vn-virtual-module")).toThrow(/Cannot find module/);
  });

  it("has no Node-side mock for a factory-less jest.mock: require() gets the module", () => {
    // Vitest builds that mock (automock or __mocks__) for imports only.
    const required = require("./fixtures/alias-app/registry/counter");
    expect(jest.isMockFunction(required.increment)).toBe(false);
    expect(required.increment()).toBe(1);
  });

  it("still loads an unmocked module, as before", () => {
    expect(jest.requireMock("./fixtures/alias-app/registry/storage").device.get("k")).toBe(
      "real-storage:k",
    );
  });
});
