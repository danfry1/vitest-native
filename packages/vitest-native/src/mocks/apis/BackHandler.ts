import { vi } from "vitest";

export function createBackHandlerMock() {
  const listeners = new Set<Function>();

  return {
    exitApp: vi.fn(),
    addEventListener: vi.fn((event: string, handler: Function) => {
      if (event === "hardwareBackPress") {
        listeners.add(handler);
      }
      return { remove: vi.fn(() => listeners.delete(handler)) };
    }),
    _simulateBackPress: () => {
      // Iterate in reverse (last registered first, matching real RN behavior)
      const handlers = [...listeners].reverse();
      for (const handler of handlers) {
        if (handler() === true) return; // handler consumed the event
      }
    },
    _reset: () => {
      listeners.clear();
    },
  };
}
