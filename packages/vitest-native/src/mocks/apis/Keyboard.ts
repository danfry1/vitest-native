import { vi } from "vitest";

export function createKeyboardMock() {
  let visible = false;
  let keyboardHeight = 0;

  const listeners = new Map<string, Set<Function>>();

  return {
    dismiss: vi.fn(() => {
      visible = false;
      keyboardHeight = 0;
    }),
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
    isVisible: vi.fn(() => visible),
    metrics: vi.fn(() =>
      visible
        ? { screenX: 0, screenY: 844 - keyboardHeight, width: 390, height: keyboardHeight }
        : undefined,
    ),
    scheduleLayoutAnimation: vi.fn(),
    // Test helper: simulate keyboard show/hide
    _show: (height: number = 336) => {
      visible = true;
      keyboardHeight = height;
      listeners
        .get("keyboardDidShow")
        ?.forEach((fn) =>
          fn({ endCoordinates: { screenX: 0, screenY: 844 - height, width: 390, height } }),
        );
    },
    _hide: () => {
      visible = false;
      keyboardHeight = 0;
      listeners.get("keyboardDidHide")?.forEach((fn) => fn({}));
    },
    _reset: () => {
      visible = false;
      keyboardHeight = 0;
      listeners.clear();
    },
  };
}
