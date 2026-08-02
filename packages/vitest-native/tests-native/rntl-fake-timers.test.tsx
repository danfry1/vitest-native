/**
 * RNTL's async helpers under fake timers, across the supported RNTL range.
 *
 * Reported as a blocker by a migration on RNTL 13.3.3: `waitFor`/`findBy*` hanging
 * once fake timers were installed. It did not reproduce, and the reason recorded at
 * the time was wrong, so this pins the real behaviour.
 *
 * RNTL's `runWithRealTimers` swaps back to real timers only when it recognises the
 * fake-timer installation, and it looks for JEST's markers:
 *
 *   legacy — globalThis.setTimeout._isMockFunction
 *   modern — globalThis.setTimeout.clock && jest.getRealSystemTime
 *
 * Under Vitest with the jest-compat layer, measured: `_isMockFunction` is undefined,
 * but `setTimeout.clock` IS set (Vitest's fake timers are @sinonjs/fake-timers, the
 * same library Jest uses) and `jest.getRealSystemTime` IS a function (the shim
 * forwards it to `vi`). So the detector fires and the swap genuinely runs — it is
 * not bypassed. It works because the shim forwards `useRealTimers`/`useFakeTimers`
 * to `vi` as well, so the round trip lands back on Vitest's own timers.
 *
 * That makes this a real dependency on the shim covering all three of
 * `getRealSystemTime`, `useRealTimers` and `useFakeTimers` — verified, not assumed:
 * deleting `jest.getRealSystemTime` for one test makes `waitFor` fail. Which is the
 * most likely explanation for the original report, since it ran against a
 * hand-rolled jest shim rather than this one: a partial shim satisfies RNTL's
 * detection and then cannot complete the swap.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import React from "react";
import { Text } from "react-native";
import { render, screen, waitFor } from "@testing-library/react-native";

declare const jest: {
  useFakeTimers(): void;
  useRealTimers(): void;
  advanceTimersByTime(ms: number): void;
  getRealSystemTime?: () => number;
};

function Delayed() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);
  return <Text>{ready ? "ready" : "waiting"}</Text>;
}

describe("RNTL async helpers under fake timers", () => {
  afterEach(() => vi.useRealTimers());

  it("exposes the markers RNTL's fake-timer detection looks for", () => {
    vi.useFakeTimers();
    // Not an implementation detail to be tidied away: RNTL branches on exactly
    // these, and the branch it takes decides whether its async helpers terminate.
    expect(typeof (globalThis.setTimeout as unknown as { clock?: unknown }).clock).toBe("object");
    expect(typeof jest.getRealSystemTime).toBe("function");
  });

  it("waitFor resolves with vi.useFakeTimers", async () => {
    vi.useFakeTimers();
    await render(<Delayed />);
    vi.advanceTimersByTime(200);
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
  }, 8000);

  it("findByText resolves with jest.useFakeTimers", async () => {
    jest.useFakeTimers();
    await render(<Delayed />);
    jest.advanceTimersByTime(200);
    expect(await screen.findByText("ready")).toBeTruthy();
  }, 8000);

  it("waitFor still terminates when the timer is never advanced", async () => {
    jest.useFakeTimers();
    await render(<Delayed />);
    await waitFor(() => expect(screen.getByText("waiting")).toBeTruthy());
  }, 8000);
});
