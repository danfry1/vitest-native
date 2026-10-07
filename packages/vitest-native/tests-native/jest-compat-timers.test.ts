// Trustworthiness: the jest-compat `jest` global is `vi` with the two timer-advance
// methods made lenient as in Jest (no-op when fake timers are not active, instead of
// vi's "timers are not mocked" throw), and `fn`/`spyOn` given Jest's mock semantics.
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
    // jest.fn/jest.spyOn are not vi's own functions — they give the mock Jest's
    // behaviour under `new` (see jest-object.mjs) — but what they return is a vi mock.
    expect(jest.useFakeTimers).toBe(vi.useFakeTimers);
    const mock = jest.fn(() => 7);
    expect(vi.isMockFunction(mock)).toBe(true);
    expect(mock()).toBe(7);
    const obj = { greet: () => "hi" };
    const spy = jest.spyOn(obj, "greet").mockReturnValue("mocked");
    expect(obj.greet()).toBe("mocked");
    expect(spy).toHaveBeenCalled();
  });
});
