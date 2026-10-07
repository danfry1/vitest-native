/**
 * `jest.isolateModules(fn)` / `jest.isolateModulesAsync(fn)`: `Runtime.isolateModules`
 * runs `fn` against a fresh module registry and a fresh mock registry, then discards
 * both, so modules loaded inside are not the ones outside, and the outside ones are
 * untouched afterwards (jest-runtime 29.7). Both used to throw "has no Vitest
 * equivalent".
 */
import { describe, expect, it } from "vitest";

declare const jest: {
  mock(path: string, factory: () => unknown): void;
  requireMock<T = any>(path: string): T;
  isolateModules(fn: () => void): void;
  isolateModulesAsync(fn: () => Promise<void>): Promise<void>;
};

jest.mock("@vn-app/registry/storage", () => ({
  device: { get: (key: string) => `mocked-storage:${key}` },
}));

type Counter = typeof import("./fixtures/alias-app/registry/counter");
const COUNTER = "@vn-app/registry/counter";

describe("jest.isolateModules", () => {
  it("loads a fresh module inside, and leaves the outer one in place", () => {
    const outer: Counter = require(COUNTER);
    outer.increment();
    let inner: Counter | undefined;
    jest.isolateModules(() => {
      inner = require(COUNTER);
      // One instance within the block.
      expect(require(COUNTER)).toBe(inner);
    });
    expect(inner).not.toBe(outer);
    expect(inner!.increment()).toBe(1);
    expect(require(COUNTER)).toBe(outer);
    expect(outer.increment()).toBe(2);
  });

  it("the isolated module still sees the file's mocks", () => {
    jest.isolateModules(() => {
      expect((require(COUNTER) as Counter).storageKey("k")).toBe("mocked-storage:k");
    });
  });

  it("gives the block its own mock instance, and restores the outer one", () => {
    const outer = jest.requireMock("@vn-app/registry/storage");
    let inner: unknown;
    jest.isolateModules(() => {
      inner = jest.requireMock("@vn-app/registry/storage");
    });
    expect(inner).not.toBe(outer);
    expect(jest.requireMock("@vn-app/registry/storage")).toBe(outer);
  });

  it("cannot be nested, with Jest's message", () => {
    expect(() => jest.isolateModules(() => jest.isolateModules(() => {}))).toThrow(
      "isolateModules cannot be nested inside another isolateModules or isolateModulesAsync.",
    );
    // The failed nesting did not leave the outer block open.
    expect(() => jest.isolateModules(() => {})).not.toThrow();
  });
});

describe("jest.isolateModulesAsync", () => {
  it("isolates require() and import() across awaits", async () => {
    const outerRequired: Counter = require(COUNTER);
    const outerImported = await import("./fixtures/alias-app/registry/counter");
    let required: Counter | undefined;
    let imported: Counter | undefined;
    await jest.isolateModulesAsync(async () => {
      await Promise.resolve();
      required = require(COUNTER);
      imported = await import("./fixtures/alias-app/registry/counter");
    });
    expect(required).not.toBe(outerRequired);
    expect(imported!.increment).not.toBe(outerImported.increment);
    // Afterwards, both graphs serve their outer instances again.
    expect(require(COUNTER)).toBe(outerRequired);
    expect((await import("./fixtures/alias-app/registry/counter")).increment).toBe(
      outerImported.increment,
    );
  });

  it("cannot be nested", async () => {
    await expect(
      jest.isolateModulesAsync(async () => {
        await jest.isolateModulesAsync(async () => {});
      }),
    ).rejects.toThrow(
      "isolateModulesAsync cannot be nested inside another isolateModules or isolateModulesAsync.",
    );
  });
});
