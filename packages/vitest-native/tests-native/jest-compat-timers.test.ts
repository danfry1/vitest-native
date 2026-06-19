// Trustworthiness: the jest-compat `jest` global is a transparent Proxy over `vi`
// that ONLY overrides the two timer-advance methods to match Jest's leniency (no-op
// when fake timers are not active, instead of vi's "timers are not mocked" throw).
// Everything else must forward to `vi` untouched. RNTL's userEvent.setup({
// advanceTimers }) commonly passes `jest.advanceTimersByTimeAsync` and calls it on
// suites that never enable fake timers — so the throw would break them.
import { afterEach, describe, expect, it, vi } from "vitest";

declare const jest: typeof vi;

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
    expect(jest.fn).toBe(vi.fn);
    const mock = jest.fn(() => 7);
    expect(mock()).toBe(7);
    const obj = { greet: () => "hi" };
    const spy = jest.spyOn(obj, "greet").mockReturnValue("mocked");
    expect(obj.greet()).toBe("mocked");
    expect(spy).toHaveBeenCalled();
  });
});
