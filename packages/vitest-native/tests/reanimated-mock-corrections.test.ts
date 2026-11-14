/**
 * Which names of reanimated's own mock the native engine replaces (mockCorrections):
 * each only while the mock still answers it with a no-op, so a reanimated whose mock
 * does better keeps its own. The no-op mock here is shaped as 4.7.1's (src/mock.ts);
 * the native suite runs the installed one (tests-native/reanimated.test.tsx).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { derivedValue, mockCorrections, sharedValue } from "../src/presets/reanimated.js";

const dir = path.dirname(
  createRequire(import.meta.url).resolve("react-native-reanimated/package.json"),
);
const NOOP = () => {};

/** The names in question, as reanimated 4.7.1's mock has them. */
function noOpMock() {
  return {
    interpolate: NOOP,
    clamp: NOOP,
    interpolateColor: NOOP,
    useAnimatedScrollHandler: () => NOOP,
    useComposedEventHandler: () => NOOP,
    useScrollOffset: () => ({ value: 0 }),
    useScrollViewOffset: () => ({ value: 0 }),
    useTimestamp: () => ({ value: 0 }),
    useDerivedValue: (updater: () => number) => ({ value: updater(), get: () => updater() }),
    useAnimatedKeyboard: () => ({ height: 0, state: 0 }),
    useAnimatedSensor: () => ({ sensor: { value: { x: 0, y: 0, z: 0 } } }),
    makeMutable: (value: number) => value,
    useSharedValue: (value: number) => ({ value, get: () => value }),
    useAnimatedStyle: (updater: () => unknown) => updater(),
    useAnimatedProps: (updater: () => unknown) => updater(),
    useAnimatedReaction: NOOP,
    default: { interpolate: NOOP, clamp: NOOP, ScrollView: () => null },
  };
}

/** The same names, as a mock that does what they say. */
function workingMock() {
  // Reanimated 4's shared value shape, whole.
  const value = {
    _isReanimatedSharedValue: true,
    value: 0,
    get: () => 0,
    set: NOOP,
    modify: NOOP,
    addListener: NOOP,
    removeListener: NOOP,
  };
  return {
    interpolate: () => "theirs",
    clamp: () => "theirs",
    interpolateColor: () => "theirs",
    // Dispatching on the event's name, as reanimated's own scroll handler does.
    useAnimatedScrollHandler:
      (handlers: { onScroll: (e: unknown) => void }) =>
      (e: { nativeEvent: { eventName?: string } }) => {
        if (e.nativeEvent.eventName?.endsWith("onScroll")) handlers.onScroll(e.nativeEvent);
      },
    useComposedEventHandler: (hs: ((e: unknown) => void)[]) => (e: unknown) =>
      hs.forEach((h) => h(e)),
    useScrollOffset: () => value,
    useScrollViewOffset: () => value,
    useTimestamp: () => value,
    useDerivedValue: () => value,
    useAnimatedKeyboard: () => ({ height: value, state: value }),
    useAnimatedSensor: () => ({ sensor: value }),
    makeMutable: () => value,
    useSharedValue: () => value,
    // A result that reads the updater again, and a reaction that runs.
    useAnimatedStyle: (updater: () => Record<string, unknown>) =>
      new Proxy({}, { get: (_target, key) => updater()[key as string] }),
    useAnimatedProps: (updater: () => Record<string, unknown>) =>
      new Proxy({}, { get: (_target, key) => updater()[key as string] }),
    useAnimatedReaction: (prepare: () => unknown, react: (p: unknown, q: unknown) => void) =>
      react(prepare(), null),
    default: { interpolate: () => "theirs", clamp: () => "theirs", ScrollView: () => null },
  };
}

const NAMES = [
  "useSharedValue",
  "interpolate",
  "clamp",
  "useAnimatedScrollHandler",
  "useComposedEventHandler",
  "useScrollOffset",
  "useScrollViewOffset",
  "useTimestamp",
  "useDerivedValue",
  "useAnimatedKeyboard",
  "useAnimatedSensor",
  "makeMutable",
  "useAnimatedStyle",
  "useAnimatedProps",
  "useAnimatedReaction",
] as const;

describe("reanimated mock corrections", () => {
  it("replace each name the mock answers with a no-op", () => {
    const mock = noOpMock();
    const fixed = mockCorrections(mock, dir);
    for (const name of NAMES) expect(fixed[name], name).not.toBe(mock[name]);
    expect(fixed.interpolate(5, [0, 10], [0, 100])).toBe(50);
    expect(fixed.clamp(5, 0, 3)).toBe(3);
    expect(fixed.default.interpolate(5, [0, 10], [0, 100])).toBe(50);
    expect(fixed.default.ScrollView).not.toBe(mock.default.ScrollView);
    // Its shared values gain listeners, on the mock's own value.
    expect(fixed.useSharedValue).not.toBe(mock.useSharedValue);
    const shared = fixed.useSharedValue(1);
    const seen: unknown[] = [];
    expect("addListener" in shared && "removeListener" in shared).toBe(true);
    shared.addListener(7, (value: unknown) => seen.push(value));
    shared.value = 2;
    shared.removeListener(7);
    shared.value = 3;
    expect(seen).toEqual([2]);
    expect(shared.get()).toBe(3); // a whole shared value: get() reads what was written
  });

  // Every helper loaded, so each probe runs: in this worker interpolateColor.js does not
  // load (it imports React Native), and a missing helper keeps the name unprobed.
  const allHelpers = {
    interpolate: () => 50,
    clamp: () => 3,
    interpolateColor: () => "rgba(0, 0, 0, 1)",
  };

  it("keep each name the mock answers itself", () => {
    const mock = workingMock();
    const fixed = mockCorrections(mock, dir, false, allHelpers);
    for (const name of [...NAMES, "interpolateColor"] as const) {
      expect(fixed[name], name).toBe(mock[name]);
    }
    expect(fixed.default.interpolate).toBe(mock.default.interpolate);
    expect(fixed.default.ScrollView).toBe(mock.default.ScrollView);
  });

  it("replace a no-op interpolateColor with reanimated's own", () => {
    const fixed = mockCorrections(noOpMock(), dir, false, allHelpers);
    expect(fixed.interpolateColor).toBe(allHelpers.interpolateColor);
  });

  it("keep a hook that needs a render (it throws outside one)", () => {
    const needsRender = () => {
      throw new Error("Invalid hook call");
    };
    const mock = {
      ...noOpMock(),
      useAnimatedScrollHandler: needsRender,
      useComposedEventHandler: needsRender,
      useScrollOffset: needsRender,
    };
    const fixed = mockCorrections(mock, dir);
    expect(fixed.useAnimatedScrollHandler).toBe(needsRender);
    expect(fixed.useComposedEventHandler).toBe(needsRender);
    expect(fixed.useScrollOffset).toBe(needsRender);
  });

  it("probe hooks without printing what a hook that needs a render logs", () => {
    const needsRender = () => {
      console.error("Invalid hook call");
      throw new Error("Invalid hook call");
    };
    const error = console.error;
    const spy = vi.fn();
    console.error = spy;
    try {
      mockCorrections(
        {
          ...noOpMock(),
          useAnimatedScrollHandler: needsRender,
          useComposedEventHandler: needsRender,
          useScrollOffset: needsRender,
          useSharedValue: needsRender,
        },
        dir,
      );
      expect(spy).not.toHaveBeenCalled();
      expect(console.error).toBe(spy);
    } finally {
      console.error = error;
    }
  });
});

// Reanimated keeps a derived value current with a mapper over the shared values its
// updater reads, run on every change of one (at once under Jest). Its mock computes the
// updater at render only, so a read after set() was stale (#351). Outside a render here,
// as the mock's hooks allow; tests-native/reanimated-shapes/derived-values.test.tsx renders.
describe("derived values", () => {
  it("the corrected useDerivedValue follows the shared values its updater reads", () => {
    const fixed = mockCorrections(noOpMock(), dir);
    const progress = fixed.useSharedValue(0);
    const sweep = fixed.useDerivedValue(() => progress.get() * 360);
    expect(sweep.get()).toBe(0);
    progress.set(0.5);
    expect(sweep.get()).toBe(180);
    progress.value = 1;
    expect(sweep.value).toBe(360);
  });

  it("a chain follows, listeners hear a changed result once, and reads are re-taken each run", () => {
    const flag = sharedValue(true);
    const a = sharedValue(1);
    const b = sharedValue(10);
    const picked = derivedValue(() => (flag.get() ? a.get() : b.get()));
    const doubled = derivedValue(() => picked.value * 2);
    const heard = vi.fn();
    doubled.addListener(1, heard);
    a.set(2);
    expect(doubled.get()).toBe(4);
    expect(heard).toHaveBeenCalledTimes(1);
    flag.set(false);
    expect(doubled.get()).toBe(20);
    a.set(3); // no longer read
    expect(heard).toHaveBeenCalledTimes(2);
    b.set(11);
    expect(doubled.get()).toBe(22);
  });
});

// Reanimated reruns a style or props updater when a shared value it read changes, and a
// reaction on mount and on each change. Its mock runs the updaters at render only and
// never the reaction (#754); tests-native/reanimated-shapes/animated-hooks.test.tsx renders.
describe("animated styles", () => {
  it("the corrected useAnimatedStyle rewrites its result in place, never the updater's own", () => {
    const fixed = mockCorrections(noOpMock(), dir);
    const progress = fixed.useSharedValue(0);
    const shown = { opacity: 0, width: 10 };
    const hidden = { opacity: 1 };
    const style = fixed.useAnimatedStyle(() => (progress.get() > 0 ? hidden : shown));
    expect(style).toEqual(shown);
    expect(style).not.toBe(shown);
    progress.set(1);
    expect(style).toEqual({ opacity: 1 });
    expect(shown).toEqual({ opacity: 0, width: 10 });
  });
});
