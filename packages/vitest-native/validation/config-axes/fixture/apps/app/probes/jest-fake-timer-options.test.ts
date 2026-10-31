// jest.useFakeTimers({ advanceTimers: true }) lets the fake clock follow real time.
// jest-compat passed Jest's options to Vitest, whose sinon config ignores unknown keys,
// so the option was dropped and the timer never fired.
import { expect, test } from "vitest";

declare const jest: {
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
