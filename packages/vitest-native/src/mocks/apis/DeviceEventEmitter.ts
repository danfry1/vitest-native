import { vi } from "vitest";

export function createDeviceEventEmitterMock() {
  const listeners = new Map<string, Set<Function>>();

  return {
    addListener: vi.fn((event: string, handler: Function) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return { remove: vi.fn(() => listeners.get(event)?.delete(handler)) };
    }),
    removeListener: vi.fn((event: string, handler: Function) => {
      listeners.get(event)?.delete(handler);
    }),
    removeAllListeners: vi.fn((event?: string) => {
      if (event) listeners.delete(event);
      else listeners.clear();
    }),
    removeSubscription: vi.fn(),
    emit: vi.fn((event: string, ...args: any[]) => {
      listeners.get(event)?.forEach((fn) => fn(...args));
    }),
    listenerCount: vi.fn((event: string) => listeners.get(event)?.size ?? 0),
    _reset: () => {
      listeners.clear();
    },
  };
}
