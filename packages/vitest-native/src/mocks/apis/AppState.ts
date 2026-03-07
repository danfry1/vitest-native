import { vi } from "vitest";

export function createAppStateMock() {
  const listeners = new Map<string, Set<Function>>();

  const mock: any = {
    currentState: "active" as string,
    isAvailable: true,
    addEventListener: vi.fn((type: string, handler: Function) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
      return { remove: vi.fn(() => listeners.get(type)?.delete(handler)) };
    }),
    _setState: (state: string) => {
      mock.currentState = state;
      listeners.get("change")?.forEach((fn) => fn(state));
    },
    _reset: () => {
      mock.currentState = "active";
      listeners.clear();
    },
  };

  return mock;
}
