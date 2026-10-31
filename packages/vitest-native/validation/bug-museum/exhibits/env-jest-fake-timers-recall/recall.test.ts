// Re-calling jest.useFakeTimers() starts a new fake clock at the real time, as Jest does.
import { expect, test } from "vitest";

declare const jest: {
  mock(path: string, factory?: () => unknown): void;
  fn<T extends (...args: never[]) => unknown>(impl?: T): T;
  requireActual<T = Record<string, unknown>>(path: string): T;
  useFakeTimers(config?: Record<string, unknown>): unknown;
  useRealTimers(): unknown;
};

test("a second useFakeTimers() starts from the real current time", () => {
  const before = Date.now();
  jest.useFakeTimers({ now: 0 });
  expect(Date.now()).toBe(0);
  jest.useFakeTimers();
  try {
    expect(Date.now()).toBeGreaterThanOrEqual(before);
  } finally {
    jest.useRealTimers();
  }
});
