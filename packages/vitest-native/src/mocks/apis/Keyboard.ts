import { vi } from "vitest";

/**
 * The keyboard's resting state, written once.
 *
 * It used to be repeated at construction and in dismiss/_hide/_reset, which is the
 * shape that lets a wrong initial value pass every gate: suites call `_reset()`
 * before asserting, so they observe the reset path and never the value the mock is
 * actually built with. Changing the construction-time values alone was caught by
 * neither the mock suite nor the cross-check. One constant, so the two cannot drift.
 */
const RESTING = { visible: false, keyboardHeight: 0 };

export function createKeyboardMock() {
  let { visible, keyboardHeight } = RESTING;

  const rest = () => {
    visible = RESTING.visible;
    keyboardHeight = RESTING.keyboardHeight;
  };

  const listeners = new Map<string, Set<Function>>();

  return {
    dismiss: vi.fn(rest),
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
      rest();
      listeners.get("keyboardDidHide")?.forEach((fn) => fn({}));
    },
    _reset: () => {
      rest();
      listeners.clear();
    },
  };
}
