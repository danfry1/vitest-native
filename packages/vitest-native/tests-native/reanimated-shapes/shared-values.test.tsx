/**
 * Every Reanimated hook that gives a shared value gives one with Reanimated 4's shape
 * (#351): the `_isReanimatedSharedValue` mark that its isSharedValue() checks, `value`,
 * get, set (a value or an updater), modify, and listeners that hear each write. Under
 * the native engine `react-native-reanimated` is Reanimated's own test mock, corrected
 * where it falls short (presets/reanimated.ts, mockCorrections). Run with jest-compat
 * on and off (vitest.reanimated-shapes.config.mts).
 *
 * Every `use*` export is classified below, so a hook Reanimated adds fails here until it
 * is: either it gives shared values (SHARED) or it does not (NOT_SHARED).
 */
import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";
import * as Reanimated from "react-native-reanimated";
import { expect, it } from "vitest";

const R = Reanimated as unknown as Record<string, (...args: any[]) => any>;

/** Each hook, called in a render, and the shared values in what it gives. */
const SHARED: Record<string, (ref: unknown) => unknown[]> = {
  useSharedValue: () => [R.useSharedValue(1)],
  useDerivedValue: () => [R.useDerivedValue(() => 1)],
  useScrollOffset: (ref) => [R.useScrollOffset(ref)],
  useScrollViewOffset: (ref) => [R.useScrollViewOffset(ref)],
  useTimestamp: () => [R.useTimestamp()],
  useAnimatedKeyboard: () => {
    const keyboard = R.useAnimatedKeyboard();
    return [keyboard.height, keyboard.state];
  },
  useAnimatedSensor: () => [R.useAnimatedSensor(1).sensor],
};

/** The hooks that give no shared value. */
const NOT_SHARED = [
  "useAnimatedProps",
  "useAnimatedReaction",
  "useAnimatedRef",
  "useAnimatedScrollHandler",
  "useAnimatedStyle",
  "useComposedEventHandler",
  "useEvent",
  "useFrameCallback",
  "useHandler",
  "useReducedMotion",
];

/** Reanimated 4's shared value shape, and that it behaves so. */
function expectSharedValue(value: any, name: string) {
  expect(value?._isReanimatedSharedValue, `${name}: the mark`).toBe(true);
  expect(R.isSharedValue(value), `${name}: isSharedValue()`).toBe(true);
  expect("value" in value, `${name}: value`).toBe(true);
  for (const method of ["get", "set", "modify", "addListener", "removeListener"]) {
    expect(typeof value[method], `${name}: ${method}()`).toBe("function");
  }
  const heard: unknown[] = [];
  value.addListener(1, (next: unknown) => heard.push(next));
  value.set(5);
  expect(value.get(), `${name}: set() then get()`).toBe(5);
  value.set((current: number) => current + 1);
  expect(value.value, `${name}: set(updater)`).toBe(6);
  value.modify((current: number) => current * 2);
  expect(value.get(), `${name}: modify()`).toBe(12);
  value.value = 3;
  value.removeListener(1);
  value.value = 4;
  expect(heard, `${name}: listeners`).toEqual([5, 6, 12, 3]);
}

it("classifies every hook Reanimated exports", () => {
  const hooks = Object.keys(R).filter(
    (name) => /^use[A-Z]/.test(name) && typeof R[name] === "function",
  );
  const classified = new Set([...Object.keys(SHARED), ...NOT_SHARED]);
  expect(hooks.filter((name) => !classified.has(name)).sort(), "unclassified hooks").toEqual([]);
});

for (const [name, call] of Object.entries(SHARED)) {
  it(`${name} gives shared values with Reanimated 4's shape`, async () => {
    let given: unknown[] = [];
    function Probe() {
      const ref = R.useAnimatedRef();
      given = call(ref);
      return <Text>probe</Text>;
    }
    await render(<Probe />);
    expect(given.length).toBeGreaterThan(0);
    given.forEach((value, index) => expectSharedValue(value, `${name}[${index}]`));
  });
}

it("makeMutable gives a shared value with Reanimated 4's shape", () => {
  expectSharedValue(R.makeMutable(0), "makeMutable");
});

it("keeps a hook's shared value across renders", async () => {
  const seen: unknown[] = [];
  function Probe({ n }: { n: number }) {
    seen.push(R.useTimestamp(), R.useAnimatedKeyboard().height);
    return <Text>{String(n)}</Text>;
  }
  const view = await render(<Probe n={1} />);
  await view.rerender(<Probe n={2} />);
  expect(seen[0]).toBe(seen[2]);
  expect(seen[1]).toBe(seen[3]);
});
