/**
 * The `jest` global must cover the documented Jest API.
 *
 * Eleven members were absent, so a migrated suite calling one got
 * `TypeError: jest.X is not a function` — the bare failure the shim's signposting
 * exists to prevent. The gaps included siblings of members that WERE covered
 * (`isolateModules` signposted but not `isolateModulesAsync`; `deepUnmock` but not
 * `dontMock`), which is what marked them as omissions rather than decisions.
 *
 * Three had a Vitest equivalent under another name and are now wired to it. The rest
 * throw an error naming the API and its closest migration.
 */
import { describe, expect, it, vi } from "vitest";

const jestGlobal = () => (globalThis as Record<string, unknown>).jest as Record<string, any>;

/** Every member this shim promises, so a future Vitest rename cannot quietly drop one. */
const JEST_API = [
  "fn", "spyOn", "mock", "unmock", "doMock", "dontMock", "deepUnmock", "setMock",
  "unstable_mockModule", "requireActual", "requireMock", "resetModules", "isolateModules",
  "isolateModulesAsync", "createMockFromModule", "genMockFromModule", "mocked",
  "replaceProperty", "clearAllMocks", "resetAllMocks", "restoreAllMocks", "useFakeTimers",
  "useRealTimers", "runAllTicks", "runAllTimers", "runAllTimersAsync", "runOnlyPendingTimers",
  "runOnlyPendingTimersAsync", "advanceTimersByTime", "advanceTimersByTimeAsync",
  "advanceTimersToNextTimer", "advanceTimersToNextTimerAsync", "clearAllTimers",
  "getTimerCount", "setSystemTime", "getRealSystemTime", "now", "setTimeout", "retryTimes",
  "enableAutomock", "disableAutomock", "autoMockOff", "autoMockOn", "onGenerateMock",
];

describe("jest global API surface", () => {
  it("exposes every documented Jest member", () => {
    const jest = jestGlobal();
    const missing = JEST_API.filter((name) => typeof jest?.[name] !== "function");
    expect(missing).toEqual([]);
  });
});

describe("members mapped onto a Vitest equivalent", () => {
  it("dontMock delegates to vi.doUnmock", () => {
    const doUnmock = vi.spyOn(vi, "doUnmock").mockImplementation(() => vi);
    try {
      jestGlobal().dontMock("some-module");
      expect(doUnmock).toHaveBeenCalledWith("some-module");
    } finally {
      doUnmock.mockRestore();
    }
  });

  it("setMock registers the given exports as the module factory", () => {
    const doMock = vi.spyOn(vi, "doMock").mockImplementation(() => vi);
    try {
      const exports = { answer: 42 };
      jestGlobal().setMock("some-module", exports);
      expect(doMock).toHaveBeenCalledTimes(1);
      const [specifier, factory] = doMock.mock.calls[0] as [string, () => unknown];
      expect(specifier).toBe("some-module");
      // The factory must yield the exports it was handed, not a copy or a wrapper.
      expect(factory()).toBe(exports);
    } finally {
      doMock.mockRestore();
    }
  });

  it("now reads the real clock, and the fake clock once timers are mocked", () => {
    const before = jestGlobal().now();
    expect(typeof before).toBe("number");
    expect(Math.abs(before - Date.now())).toBeLessThan(5_000);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2020-01-02T03:04:05.000Z"));
      expect(jestGlobal().now()).toBe(Date.parse("2020-01-02T03:04:05.000Z"));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("members with no equivalent", () => {
  // Each must name itself and point somewhere, rather than surfacing as a TypeError.
  const signposted: [string, unknown[]][] = [
    ["isolateModules", [() => {}]],
    ["isolateModulesAsync", [async () => {}]],
    ["createMockFromModule", ["some-module"]],
    ["genMockFromModule", ["some-module"]],
    ["deepUnmock", ["some-module"]],
    ["unstable_mockModule", ["some-module", () => ({})]],
    ["replaceProperty", [{}, "key", 1]],
    ["enableAutomock", []],
    ["disableAutomock", []],
    ["autoMockOff", []],
    ["autoMockOn", []],
    ["onGenerateMock", [() => {}]],
  ];

  for (const [name, args] of signposted) {
    it(`${name} throws an error naming itself and the migration`, () => {
      expect(() => jestGlobal()[name](...args)).toThrow(
        new RegExp(`jest\\.${name}\\(\\) has no Vitest equivalent`),
      );
      expect(() => jestGlobal()[name](...args)).toThrow(/migrating-from-jest/);
    });
  }
});
