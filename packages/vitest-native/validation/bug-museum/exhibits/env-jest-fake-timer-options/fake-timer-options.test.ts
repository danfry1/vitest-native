// jest.useFakeTimers({ advanceTimers: true }) lets the fake clock follow real time.
import { expect, test } from "vitest";

declare const jest: {
  mock(path: string, factory?: () => unknown): void;
  fn<T extends (...args: never[]) => unknown>(impl?: T): T;
  requireActual<T = Record<string, unknown>>(path: string): T;
  useFakeTimers(config?: Record<string, unknown>): unknown;
  useRealTimers(): unknown;
};

test("advanceTimers: true advances the fake clock with real time", async () => {
  const realSetTimeout = globalThis.setTimeout;
  jest.useFakeTimers({ advanceTimers: true });
  try {
    const fired = new Promise<string>((resolve) => setTimeout(() => resolve("fired"), 20));
    const stood = new Promise<string>((resolve) =>
      realSetTimeout(() => resolve("the fake clock stood still"), 1_500),
    );
    expect(await Promise.race([fired, stood])).toBe("fired");
  } finally {
    jest.useRealTimers();
  }
});
