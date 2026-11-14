/**
 * A derived value follows the shared values its updater reads, without a render, as
 * Reanimated's mapper keeps it (#351): a read after `set()` sees the new result, a chain
 * of derived values follows, listeners hear it, and a memoized child that React skips
 * still holds a current derived value for whatever reads it later, such as a Skia prop.
 * Reanimated's own test mock computes the updater once per render only.
 */
import React, { Suspense } from "react";
import { act, render, screen } from "@testing-library/react-native";
import { type SharedValue, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { Canvas, Circle } from "react-native-skia";
import { expect, it, vi } from "vitest";

it("a derived value read after set() is the updater's new result", async () => {
  let progress!: SharedValue<number>;
  let sweep!: SharedValue<number>;
  function Arc() {
    progress = useSharedValue(0);
    sweep = useDerivedValue(() => progress.get() * 360);
    return null;
  }
  await render(<Arc />);
  expect(sweep.get()).toBe(0);
  progress.set(0.5);
  expect(sweep.get()).toBe(180);
  progress.value = 1;
  expect(sweep.value).toBe(360);
});

it("a derived value of a derived value follows, and its listeners hear each change", async () => {
  let progress!: SharedValue<number>;
  let label!: SharedValue<string>;
  function Arc() {
    progress = useSharedValue(0);
    const sweep = useDerivedValue(() => progress.value * 360);
    label = useDerivedValue(() => `${sweep.value}deg`);
    return null;
  }
  await render(<Arc />);
  const heard = vi.fn();
  label.addListener(1, heard);
  progress.set(0.25);
  expect(label.get()).toBe("90deg");
  expect(heard).toHaveBeenCalledWith("90deg");
});

it("a memoized child that React skips keeps a current derived value", async () => {
  let sweep!: SharedValue<number>;
  const Child = React.memo(function Child({ progress }: { progress: SharedValue<number> }) {
    sweep = useDerivedValue(() => progress.get() * 360);
    return null;
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
  expect(sweep.get()).toBe(180);
});

it("an unmounted component's derived value stops following", async () => {
  let progress!: SharedValue<number>;
  const updater = vi.fn(() => progress.get() * 2);
  function Owner() {
    progress = useSharedValue(1);
    useDerivedValue(updater);
    return null;
  }
  const { unmount } = await render(<Owner />);
  await act(async () => unmount());
  updater.mockClear();
  progress.set(2);
  expect(updater).not.toHaveBeenCalled();
});

it("a Skia prop given a derived value holds it, current after a change without a render", async () => {
  // Skia's own test mock draws nothing: its Canvas is a View and each shape a host
  // element whose props are as given, so the prop is the shared value itself.
  let progress!: SharedValue<number>;
  function Ring() {
    progress = useSharedValue(0);
    const radius = useDerivedValue(() => 10 + progress.get() * 100);
    return (
      <Canvas testID="ring">
        <Circle cx={0} cy={0} r={radius} color="red" />
      </Canvas>
    );
  }
  await render(<Ring />);
  const circle = screen.getByTestId("ring").children[0] as { props: { r: SharedValue<number> } };
  expect(circle.props.r.value).toBe(10);
  progress.set(0.5);
  expect(circle.props.r.value).toBe(60);
});

it("a render React discards follows nothing", async () => {
  // A component that suspends before it commits: no effect runs, so nothing would stop
  // what its render started. Reanimated starts its mapper only in an effect.
  let progress!: SharedValue<number>;
  const updater = vi.fn(() => progress.get() * 2);
  const never = new Promise(() => {});
  function Suspends() {
    useDerivedValue(updater);
    throw never;
  }
  function Holder() {
    progress = useSharedValue(0);
    return (
      <Suspense fallback={null}>
        <Suspends />
      </Suspense>
    );
  }
  await render(<Holder />);
  updater.mockClear();
  progress.set(1);
  expect(updater).not.toHaveBeenCalled();
});

it("after a rerender, a derived value follows what the committed render's updater read", async () => {
  let a!: SharedValue<number>;
  let b!: SharedValue<number>;
  let picked!: SharedValue<number>;
  function Picker({ useB }: { useB: boolean }) {
    a = useSharedValue(1);
    b = useSharedValue(10);
    picked = useDerivedValue(() => (useB ? b.get() : a.get()));
    return null;
  }
  const { rerender } = await render(<Picker useB={false} />);
  await rerender(<Picker useB />);
  b.set(11);
  expect(picked.get()).toBe(11);
});
