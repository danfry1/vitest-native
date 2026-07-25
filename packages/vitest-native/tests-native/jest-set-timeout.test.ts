/**
 * `jest.setTimeout(ms)` must actually change the timeout.
 *
 * It was a no-op, on the grounds that `vi` had no equivalent. `vi.setConfig` is one.
 * The no-op did not crash anything, which is what made it costly: a suite opening with
 * `jest.setTimeout(30000)` — routine for slower React Native suites — silently kept
 * Vitest's 5s default, and its slow tests failed on time while the line meant to
 * prevent exactly that sat above them looking effective.
 *
 * Verified behaviourally when the fix landed: with the no-op restored, a 6s test under
 * `jest.setTimeout(20000)` failed with "Test timed out in 5000ms"; with the fix it
 * passes, and a lowered `jest.setTimeout(60)` times out at 60ms. Neither shape belongs
 * in a suite that has to stay fast, so what is pinned here is the delegation.
 */
import { expect, it, vi } from "vitest";

it("forwards jest.setTimeout to vi.setConfig as a testTimeout", () => {
  const jestGlobal = (globalThis as Record<string, unknown>).jest as {
    setTimeout: (ms: number) => void;
  };
  expect(typeof jestGlobal?.setTimeout).toBe("function");

  const setConfig = vi.spyOn(vi, "setConfig");
  try {
    jestGlobal.setTimeout(12_345);
    expect(setConfig).toHaveBeenCalledWith({ testTimeout: 12_345 });
  } finally {
    setConfig.mockRestore();
    vi.resetConfig();
  }
});

it("ignores a non-numeric argument rather than corrupting the config", () => {
  const jestGlobal = (globalThis as Record<string, unknown>).jest as {
    setTimeout: (ms: unknown) => void;
  };
  const setConfig = vi.spyOn(vi, "setConfig");
  try {
    jestGlobal.setTimeout(undefined);
    jestGlobal.setTimeout("30s");
    expect(setConfig).not.toHaveBeenCalled();
  } finally {
    setConfig.mockRestore();
  }
});
