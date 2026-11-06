/**
 * Jest has one module registry per test file, so a module `jest.requireActual` loads
 * still sees the file's other mocks: `Runtime.requireActual` unmocks only the module it
 * was asked for (jest-runtime, `requireModule(from, name, undefined, true)`), and that
 * module's own imports go through `requireModuleOrMock` as usual.
 *
 * The shape is from a production app: a module is mocked with its web variant, pulled
 * in through `jest.requireActual`, while the storage that variant imports is mocked
 * too. Under Vitest the variant loads through Node, where no mock applied, so it read
 * the REAL storage.
 */
import { describe, expect, it, vi } from "vitest";
import { kind, sessionId } from "@vn-app/registry/session";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  requireActual<T = any>(path: string): T;
  requireMock<T = any>(path: string): T;
};

jest.mock("@vn-app/registry/storage", () => ({
  device: { get: (key: string) => `mocked-storage:${key}` },
}));
jest.mock("@vn-app/registry/session", () =>
  jest.requireActual("@vn-app/registry/session/index.web"),
);

describe("a module loaded by jest.requireActual", () => {
  it("is the requested module", () => {
    expect(kind).toBe("web");
  });

  it("sees the file's mock of a module it imports", () => {
    expect(sessionId()).toBe("mocked-storage:session");
  });

  it("sees it through a relative specifier as well", () => {
    const web = jest.requireActual("./fixtures/alias-app/registry/session/index.web");
    expect(web.sessionId()).toBe("mocked-storage:session");
  });
});

describe("jest.requireActual of a mocked module", () => {
  it("returns the real module, for that request only", () => {
    expect(jest.requireActual("@vn-app/registry/storage").device.get("k")).toBe("real-storage:k");
    // The mock is still what everything else gets.
    expect(require("@vn-app/registry/storage").device.get("k")).toBe("mocked-storage:k");
  });
});

describe("require() from a test file", () => {
  it("gets the mock, the same object jest.requireMock returns", () => {
    const required = require("@vn-app/registry/storage");
    expect(required.device.get("k")).toBe("mocked-storage:k");
    expect(jest.requireMock("@vn-app/registry/storage")).toBe(required);
    // A relative specifier resolves against this file and lands on the same entry.
    expect(require("./fixtures/alias-app/registry/storage")).toBe(required);
  });
});

describe("jest.requireActual of a package a preset shadows", () => {
  it("is the package, not the preset", () => {
    // The safe-area-context preset shadows the package by name (its module is the
    // library's own mock, whose hooks are mock functions); Jest's requireActual gives
    // the real package, whose hooks are not.
    const actual = jest.requireActual<Record<string, unknown>>("react-native-safe-area-context");
    const shadowed = jest.requireMock<Record<string, unknown>>("react-native-safe-area-context");
    expect(vi.isMockFunction(shadowed.useSafeAreaInsets)).toBe(true);
    expect(typeof actual.useSafeAreaInsets).toBe("function");
    expect(vi.isMockFunction(actual.useSafeAreaInsets)).toBe(false);
    // Only that load: the next one by name is the preset again.
    expect(jest.requireMock<Record<string, unknown>>("react-native-safe-area-context")).toBe(
      shadowed,
    );
  });
});
