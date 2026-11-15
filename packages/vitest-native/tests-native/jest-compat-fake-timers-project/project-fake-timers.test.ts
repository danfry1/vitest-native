// With the project's test.fakeTimers naming the APIs to fake, jest.useFakeTimers() fakes
// those and leaves queueMicrotask real; a call's own doNotFake still names its own list.
import { afterEach, expect, test, vi } from "vitest";

declare const jest: typeof vi & {
  useFakeTimers(config?: Record<string, unknown>): unknown;
};

const realQueueMicrotask = globalThis.queueMicrotask;
const realSetInterval = globalThis.setInterval;

afterEach(() => {
  vi.useRealTimers();
});

test("jest.useFakeTimers() fakes the project's list only", () => {
  jest.useFakeTimers();
  expect(globalThis.queueMicrotask).toBe(realQueueMicrotask);
  expect(globalThis.setInterval).toBe(realSetInterval);
  expect(vi.isFakeTimers()).toBe(true);
});

test("a call's doNotFake fakes everything else, queueMicrotask included", () => {
  jest.useFakeTimers({ doNotFake: ["Date"] });
  expect(globalThis.queueMicrotask).not.toBe(realQueueMicrotask);
  expect(globalThis.setInterval).not.toBe(realSetInterval);
});
