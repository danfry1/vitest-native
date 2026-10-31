// Trustworthiness: the jest-compat `jest` global is `vi` with the two timer-advance
// methods made lenient as in Jest (no-op when fake timers are not active, instead of
// vi's "timers are not mocked" throw), `fn`/`spyOn` given Jest's mock semantics, and
// `useFakeTimers` taking Jest's options (see toVitestFakeTimersConfig in
// jest-object.mjs). Everything else must forward to `vi` untouched. RNTL's userEvent.setup({
// advanceTimers }) commonly passes `jest.advanceTimersByTimeAsync` and calls it on
// suites that never enable fake timers — so the throw would break them.
import { afterEach, describe, expect, it, vi } from "vitest";

declare const jest: Omit<typeof vi, "useFakeTimers" | "useRealTimers"> & {
  useFakeTimers(config?: Record<string, unknown>): typeof jest;
  useRealTimers(): typeof jest;
};

// The real clock, captured before any test fakes it.
const native = {
  setTimeout: globalThis.setTimeout,
  setInterval: globalThis.setInterval,
  performance: globalThis.performance,
  Date: globalThis.Date,
};
const realDelay = (ms: number) => new Promise<void>((resolve) => native.setTimeout(resolve, ms));
/** Wait in real time until `done()` holds, or give up after `limit` ms. */
async function realUntil(done: () => boolean, limit = 3000) {
  const start = native.Date.now();
  while (!done() && native.Date.now() - start < limit) await realDelay(5);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("jest-compat timer leniency", () => {
  it("advanceTimersByTimeAsync is a no-op (resolves) when fake timers are inactive", async () => {
    expect(vi.isFakeTimers()).toBe(false);
    await expect(jest.advanceTimersByTimeAsync(1000)).resolves.toBeUndefined();
  });

  it("advanceTimersByTime is a no-op when fake timers are inactive", () => {
    expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
  });

  it("still advances real fake timers when they ARE active", async () => {
    jest.useFakeTimers();
    const fn = vi.fn();
    setTimeout(fn, 500);
    await jest.advanceTimersByTimeAsync(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("forwards the rest of the API to vi (fn, spyOn, identity)", () => {
    // jest.fn/jest.spyOn are not vi's own functions — they give the mock Jest's
    // behaviour under `new` (see jest-object.mjs) — but what they return is a vi mock.
    expect(jest.runAllTimers).toBe(vi.runAllTimers);
    const mock = jest.fn(() => 7);
    expect(vi.isMockFunction(mock)).toBe(true);
    expect(mock()).toBe(7);
    const obj = { greet: () => "hi" };
    const spy = jest.spyOn(obj, "greet").mockReturnValue("mocked");
    expect(obj.greet()).toBe("mocked");
    expect(spy).toHaveBeenCalled();
  });
});

describe("jest.useFakeTimers takes Jest's options", () => {
  it("advanceTimers: true advances the fake clock with real time", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const fn = vi.fn();
    setTimeout(fn, 30);
    // Nothing advances the clock by hand: only real time can fire it. Passed straight
    // to vi.useFakeTimers, the option was dropped and this stayed uncalled.
    await realUntil(() => fn.mock.calls.length > 0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("advanceTimers: <number> advances the clock in steps of that many ms", async () => {
    jest.useFakeTimers({ advanceTimers: 200 });
    const start = Date.now();
    await realUntil(() => Date.now() !== start);
    // sinon ticks by `advanceTimeDelta` every `advanceTimeDelta` real ms; with
    // `advanceTimers: true` the step would be its default 20.
    expect((Date.now() - start) % 200).toBe(0);
    expect(Date.now() - start).toBeGreaterThan(0);
  });

  it("doNotFake leaves the named APIs real and fakes the rest", () => {
    jest.useFakeTimers({ doNotFake: ["setTimeout", "performance"] });
    expect(globalThis.setTimeout).toBe(native.setTimeout);
    expect(globalThis.performance).toBe(native.performance);
    expect(globalThis.setInterval).not.toBe(native.setInterval);
    expect(globalThis.Date).not.toBe(native.Date);
  });

  it("starts each install from the real clock, so a pinned date does not leak", () => {
    // Jest's `now ?? Date.now()` reads the real clock on every install. Vitest resumes
    // from the current (fake) Date.now(), so without the translation a date pinned in
    // one test carried into the next test's jest.useFakeTimers().
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2000-01-01T00:00:00Z"));
    jest.useFakeTimers();
    expect(Math.abs(Date.now() - native.Date.now())).toBeLessThan(60_000);
    // `now: null` is Jest's "the real clock" too, through the same `??`.
    jest.setSystemTime(new Date("2000-01-01T00:00:00Z"));
    jest.useFakeTimers({ now: null });
    expect(Math.abs(Date.now() - native.Date.now())).toBeLessThan(60_000);
  });

  it("returns the jest object, so calls chain as in Jest", () => {
    const at = Date.UTC(2021, 5, 1);
    expect(jest.useFakeTimers()).toBe(jest);
    jest.useFakeTimers().setSystemTime(at);
    expect(Date.now()).toBe(at);
    expect(jest.useRealTimers()).toBe(jest);
    expect(vi.isFakeTimers()).toBe(false);
  });

  it("with no options fakes what vi.useFakeTimers() fakes", () => {
    jest.useFakeTimers();
    expect(globalThis.setTimeout).not.toBe(native.setTimeout);
    expect(globalThis.Date).not.toBe(native.Date);
  });

  it("legacyFakeTimers fakes the timer functions, leaves Date real, and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    jest.useFakeTimers({ legacyFakeTimers: true });
    jest.useFakeTimers({ legacyFakeTimers: true });
    expect(globalThis.setTimeout).not.toBe(native.setTimeout);
    expect(globalThis.Date).toBe(native.Date);
    const fn = vi.fn();
    setTimeout(fn, 1000);
    jest.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("legacyFakeTimers");
  });
});
