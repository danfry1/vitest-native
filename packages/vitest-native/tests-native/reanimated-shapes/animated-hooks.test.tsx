/**
 * useAnimatedStyle, useAnimatedProps and useAnimatedReaction follow the shared values
 * their updaters read, without a render, as Reanimated's mappers do (#754). A style or
 * props a test reads after `set()` is the updater's new result, also in a child React
 * skipped, and a reaction runs on mount and on each change of what it prepares from.
 * Reanimated's own test mock runs the updaters only at render and never the reaction.
 */
import React from "react";
import { act, render, screen } from "@testing-library/react-native";
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { expect, it, vi } from "vitest";

it("an animated style read after set() is the updater's new result", async () => {
  let progress!: SharedValue<number>;
  function Fader() {
    progress = useSharedValue(0);
    const style = useAnimatedStyle(() => ({ opacity: progress.get() }));
    return <Animated.View testID="fader" style={[{ width: 10 }, style]} />;
  }
  await render(<Fader />);
  expect(screen.getByTestId("fader")).toHaveAnimatedStyle({ opacity: 0, width: 10 });
  progress.set(0.5);
  expect(screen.getByTestId("fader")).toHaveAnimatedStyle({ opacity: 0.5, width: 10 });
  progress.value = 1;
  expect(screen.getByTestId("fader")).toHaveAnimatedStyle({ opacity: 1 });
});

it("a memoized child that React skips shows the current animated style", async () => {
  const Child = React.memo(function Child({ progress }: { progress: SharedValue<number> }) {
    const style = useAnimatedStyle(() => ({ transform: [{ translateX: progress.get() * 100 }] }));
    return <Animated.View testID="slider" style={style} />;
  });
  function Parent() {
    const progress = useSharedValue(0);
    React.useEffect(() => {
      progress.set(0.5);
    }, [progress]);
    return <Child progress={progress} />;
  }
  const { rerender } = await render(<Parent />);
  await rerender(<Parent />);
  expect(screen.getByTestId("slider")).toHaveAnimatedStyle({ transform: [{ translateX: 50 }] });
});

it("a style the updater drops is gone, and a style object it returns is left as it was", async () => {
  const shown = { opacity: 1 };
  const hidden = { display: "none" as const };
  let visible!: SharedValue<boolean>;
  function Panel() {
    visible = useSharedValue(true);
    const style = useAnimatedStyle(() => (visible.get() ? shown : hidden));
    return <Animated.View testID="panel" style={style} />;
  }
  await render(<Panel />);
  visible.set(false);
  // Hidden now, so the query includes hidden elements.
  expect(screen.getByTestId("panel", { includeHiddenElements: true })).toHaveAnimatedStyle(
    { display: "none" },
    { shouldMatchAllProps: true },
  );
  expect(shown).toEqual({ opacity: 1 });
  expect(hidden).toEqual({ display: "none" });
});

it("animated props read after set() are the updater's new result", async () => {
  let radius!: SharedValue<number>;
  function Dot() {
    radius = useSharedValue(1);
    const animatedProps = useAnimatedProps(() => ({ r: radius.get() * 10 }));
    return <Animated.View testID="dot" animatedProps={animatedProps} />;
  }
  await render(<Dot />);
  expect(screen.getByTestId("dot")).toHaveAnimatedProps({ r: 10 });
  radius.set(3);
  expect(screen.getByTestId("dot")).toHaveAnimatedProps({ r: 30 });
});

it("a reaction runs on mount and on each change of what it prepares from", async () => {
  let progress!: SharedValue<number>;
  const react = vi.fn();
  function Watcher() {
    progress = useSharedValue(0);
    useAnimatedReaction(() => Math.round(progress.get() * 10), react);
    return null;
  }
  await render(<Watcher />);
  expect(react.mock.calls).toEqual([[0, null]]);
  progress.set(0.5);
  expect(react.mock.calls).toEqual([
    [0, null],
    [5, 0],
  ]);
});

it("a reaction can write a shared value that the component reads", async () => {
  let progress!: SharedValue<number>;
  let done!: SharedValue<boolean>;
  function Watcher() {
    progress = useSharedValue(0);
    done = useSharedValue(false);
    useAnimatedReaction(
      () => progress.get() >= 1,
      (finished) => {
        if (finished) done.set(true);
      },
    );
    return null;
  }
  await render(<Watcher />);
  expect(done.get()).toBe(false);
  progress.set(1);
  expect(done.get()).toBe(true);
});

it("an unmounted component's style and reaction stop following", async () => {
  let progress!: SharedValue<number>;
  const updater = vi.fn(() => ({ opacity: progress.get() }));
  const prepare = vi.fn(() => progress.get());
  function Owner() {
    progress = useSharedValue(1);
    useAnimatedStyle(updater);
    useAnimatedReaction(prepare, () => {});
    return null;
  }
  const { unmount } = await render(<Owner />);
  await act(async () => unmount());
  updater.mockClear();
  prepare.mockClear();
  progress.set(2);
  expect(updater).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
});
