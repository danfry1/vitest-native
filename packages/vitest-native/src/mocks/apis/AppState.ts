import { vi } from "vitest";

/**
 * Resting app state, written once — see Keyboard.ts for why not twice.
 *
 * "active" (a foregrounded app) is the mock's choice, not something real React
 * Native reports under Node: there it reads from a native module that only exists on
 * a device, so it is undefined, as it also is under Jest with React Native's own
 * preset. Recorded in crosscheck/known-differences.json.
 */
const RESTING_STATE = "active";

export function createAppStateMock() {
  const listeners = new Map<string, Set<Function>>();

  const mock: any = {
    currentState: RESTING_STATE as string,
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
      mock.currentState = RESTING_STATE;
      listeners.clear();
    },
  };

  return mock;
}
