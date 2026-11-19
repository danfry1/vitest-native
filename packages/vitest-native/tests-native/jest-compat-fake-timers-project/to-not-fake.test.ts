// Under a project whose test.fakeTimers.toNotFake keeps Date and performance real, its own
// or one a workspace project inherits (#892). jest.useFakeTimers() leaves that list real.
// A call's doNotFake replaces it, as Jest's call config replaces its project's doNotFake.
import { afterEach, expect, test, vi } from "vitest";

declare const jest: typeof vi & {
  useFakeTimers(config?: Record<string, unknown>): unknown;
};

const RealDate = globalThis.Date;
const realPerformance = globalThis.performance;
const realSetTimeout = globalThis.setTimeout;
const realSetInterval = globalThis.setInterval;

afterEach(() => {
  vi.useRealTimers();
});

test("jest.useFakeTimers() keeps the project's toNotFake real", () => {
  jest.useFakeTimers();
  expect(globalThis.Date).toBe(RealDate);
  expect(globalThis.performance).toBe(realPerformance);
  expect(globalThis.setTimeout).not.toBe(realSetTimeout);
});

test("a call's doNotFake names the real APIs in place of the project's", () => {
  jest.useFakeTimers({ doNotFake: ["setInterval", "performance"] });
  expect(globalThis.setInterval).toBe(realSetInterval);
  expect(globalThis.performance).toBe(realPerformance);
  expect(globalThis.Date).not.toBe(RealDate);
  expect(globalThis.setTimeout).not.toBe(realSetTimeout);
});

test("legacyFakeTimers fakes the timer functions and leaves Date real", () => {
  jest.useFakeTimers({ legacyFakeTimers: true });
  expect(globalThis.Date).toBe(RealDate);
  expect(globalThis.setTimeout).not.toBe(realSetTimeout);
});
