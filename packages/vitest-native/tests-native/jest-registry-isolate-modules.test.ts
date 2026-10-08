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
  resetModules(): void;
};

jest.mock("@vn-app/registry/storage", () => ({
  device: { get: (key: string) => `mocked-storage:${key}` },
}));
jest.mock("@vn-app/registry/sentry", () => ({ Sentry: "isolated-mock" }));

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

  // jest-runtime 29.7 `requireMock` (build/index.js:932-943) looks in the isolated mock
  // registry and then the outer `_mockRegistry`, and only stores a NEW mock in the
  // isolated one.
  it("reuses a mock created before the block", () => {
    const outer = jest.requireMock("@vn-app/registry/storage");
    let inner: unknown;
    jest.isolateModules(() => {
      inner = jest.requireMock("@vn-app/registry/storage");
    });
    expect(inner).toBe(outer);
    expect(jest.requireMock("@vn-app/registry/storage")).toBe(outer);
  });

  it("creates a mock first used inside the block afresh, and discards it afterwards", () => {
    let inner: unknown;
    jest.isolateModules(() => {
      inner = jest.requireMock("@vn-app/registry/sentry");
      expect(jest.requireMock("@vn-app/registry/sentry")).toBe(inner);
    });
    expect((inner as { Sentry: string }).Sentry).toBe("isolated-mock");
    expect(jest.requireMock("@vn-app/registry/sentry")).not.toBe(inner);
  });

  it("ends the block at jest.resetModules(), as Jest's resetModules nulls its registries", () => {
    let inside: Counter | undefined;
    jest.isolateModules(() => {
      jest.resetModules();
      inside = require(COUNTER);
    });
    expect(require(COUNTER)).toBe(inside);
  });

  // Exactly Jest's error (jest-runtime 29.7, index.js:1074-1078): `toThrow(new Error(m))`
  // compares the whole message, so a prefixed one fails a suite written against Jest.
  it("cannot be nested, with Jest's message", () => {
    expect(() => jest.isolateModules(() => jest.isolateModules(() => {}))).toThrow(
      new Error(
        "isolateModules cannot be nested inside another isolateModules or isolateModulesAsync.",
      ),
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
      new Error(
        "isolateModulesAsync cannot be nested inside another isolateModulesAsync or isolateModules.",
      ),
    );
  });
});
