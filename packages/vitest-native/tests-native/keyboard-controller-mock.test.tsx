/**
 * Under the native engine react-native-keyboard-controller is its own Jest mock
 * (`react-native-keyboard-controller/jest`), with what that mock lacks of the package's
 * public API added (presets/keyboard-controller.ts, mockCorrections; #708).
 * tests/keyboard-controller-corrections.test.ts checks the corrections on their own.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import {
  KEYBOARD_BORDER_RADIUS,
  KEYBOARD_HAS_ROUNDED_CORNERS,
  KeyboardContext,
  KeyboardController,
  KeyboardState,
  useAnimatedKeyboard,
  useKeyboardContext,
  useReanimatedFocusedInput,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import { expect, it, vi } from "vitest";

/** Renders `hook` in a component and returns what it gave on each render. */
async function renderHook<T>(hook: () => T, wrap = (node: React.ReactElement) => node) {
  const seen: T[] = [];
  function Probe({ tick }: { tick: number }) {
    void tick;
    seen.push(hook());
    return null;
  }
  const { rerender } = await render(wrap(<Probe tick={0} />));
  return { seen, rerender: () => rerender(wrap(<Probe tick={1} />)) };
}

it("useReanimatedKeyboardAnimation gives shared values with listeners and modify()", async () => {
  const { seen } = await renderHook(() => useReanimatedKeyboardAnimation());
  const { height, progress } = seen[0];
  expect(progress.get()).toBe(0);
  const heard: number[] = [];
  height.addListener(1, (value: number) => heard.push(value));
  height.set(300);
  height.modify((value: number) => value + 10);
  height.removeListener(1);
  height.set(0);
  expect(heard).toEqual([300, 310]);
});

it("useAnimatedKeyboard gives a height and a state per component, as before any keyboard event", async () => {
  const { seen, rerender } = await renderHook(() => useAnimatedKeyboard());
  await rerender();
  expect(seen[0].height.get()).toBe(0);
  expect(seen[0].state.get()).toBe(KeyboardState.UNKNOWN);
  expect(seen[1].height).toBe(seen[0].height);
  expect(typeof seen[0].state.addListener).toBe("function");
  expect(KeyboardState).toEqual({ UNKNOWN: 0, OPENING: 1, OPEN: 2, CLOSING: 3, CLOSED: 4 });
});

it("useKeyboardContext reads KeyboardContext, whose default is the package's", async () => {
  const { seen } = await renderHook(() => useKeyboardContext());
  const context = seen[0];
  expect(context.enabled).toBe(true);
  expect(context.layout.get()).toBeNull();
  await expect(context.update()).resolves.toBeUndefined();
  expect(typeof context.setKeyboardHandlers({} as never)).toBe("function");
  expect(context.reanimated.height).toBe(
    (await renderHook(() => useReanimatedKeyboardAnimation())).seen[0].height,
  );

  const provided = { ...context, enabled: false };
  const inside = await renderHook(
    () => useKeyboardContext(),
    (node) => <KeyboardContext.Provider value={provided}>{node}</KeyboardContext.Provider>,
  );
  expect(inside.seen[0].enabled).toBe(false);
});

it("useReanimatedFocusedInput gives the focused input as a shared value, and update()", async () => {
  const { seen } = await renderHook(() => useReanimatedFocusedInput());
  const { input, update } = seen[0];
  expect(input.get()?.layout).toMatchObject({ width: 200, height: 40 });
  expect(typeof input.modify).toBe("function");
  await expect(update()).resolves.toBeUndefined();
});

it("serves the rounded-corner constants and KeyboardController.setTranslucent", () => {
  expect(KEYBOARD_BORDER_RADIUS).toBe(0);
  expect(KEYBOARD_HAS_ROUNDED_CORNERS).toBe(false);
  KeyboardController.setTranslucent(true);
  expect(KeyboardController.setTranslucent).toHaveBeenCalledWith(true);
});

it("the corrected hooks still answer after vi.resetAllMocks()", async () => {
  vi.resetAllMocks();
  const { seen } = await renderHook(() => ({
    keyboard: useAnimatedKeyboard(),
    animation: useReanimatedKeyboardAnimation(),
    focused: useReanimatedFocusedInput(),
    context: useKeyboardContext(),
  }));
  expect(seen[0].keyboard.height.get()).toBe(0);
  expect(seen[0].animation.progress.get()).toBe(0);
  expect(typeof seen[0].focused.update).toBe("function");
  expect(seen[0].context.enabled).toBe(true);
});
