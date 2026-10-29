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
 * Under Vitest, `_isMockFunction` is undefined but `setTimeout.clock` IS set (Vitest's
 * fake timers are @sinonjs/fake-timers, the same library Jest uses), so the modern
 * branch fires and the swap runs. The `jest` it reads is not the global one: RNTL's
 * own files get a `jest` of their own whose `getRealSystemTime`, `useRealTimers` and
 * `useFakeTimers` call `vi` (src/native/rntl-timers.mjs), with or without jest-compat.
 * The first test below checks the global's markers, which this suite's own code reads.
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
