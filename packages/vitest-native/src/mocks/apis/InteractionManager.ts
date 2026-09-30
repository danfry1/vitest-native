import { vi } from "vitest";
import { mockFn } from "../mock-fn.js";

export function createInteractionManagerMock() {
  return {
    runAfterInteractions: vi.fn((task?: Function | { gen: () => Generator }) => {
      const cb = typeof task === "function" ? task : task?.gen;
      cb?.();
      const promise = Promise.resolve();
      // eslint-disable-next-line unicorn/no-thenable -- matches real RN InteractionManager API
      return {
        then: promise.then.bind(promise),
        done: promise.then.bind(promise),
        cancel: mockFn(),
      };
    }),
    createInteractionHandle: vi.fn(() => 1),
    clearInteractionHandle: mockFn(),
    setDeadline: mockFn(),
  };
}
