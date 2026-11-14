/**
 * The animated hooks run as Reanimated's mappers do under Jest (src/mappers.ts): a write
 * runs one pass over the mappers that read the value, in order, each once; a write made
 * during a pass does not start another (`processingMappers`), so a body that writes what it
 * reads cannot recurse; and a mapper starts in an effect, so a render React discards
 * starts nothing.
 */
import React, { Suspense } from "react";
import { act, render, screen } from "@testing-library/react-native";
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { expect, it, vi } from "vitest";

it("a style updater that writes a value it reads runs once per write", async () => {
  let x!: SharedValue<number>;
  let runs = 0;
  function Counted() {
    x = useSharedValue(0);
    const count = useSharedValue(0);
    const style = useAnimatedStyle(() => {
      runs++;
      count.value = count.value + 1;
      return { opacity: x.get() };
    });
    return <Animated.View testID="counted" style={style} />;
  }
  await render(<Counted />);
  const mounted = runs;
  x.set(0.5);
  expect(runs).toBe(mounted + 1);
  expect(screen.getByTestId("counted")).toHaveAnimatedStyle({ opacity: 0.5 });
});

it("a mapper that wrote its own input reruns on the next pass any mapper input's write starts", async () => {
  // Reanimated keeps it dirty; a write that no mapper reads starts no pass.
  let x!: SharedValue<number>;
  let y!: SharedValue<number>;
  let unread!: SharedValue<number>;
  let runs = 0;
  function Pair() {
    x = useSharedValue(0);
    y = useSharedValue(0);
    unread = useSharedValue(0);
    const count = useSharedValue(0);
    useDerivedValue(() => {
      runs++;
      count.value = count.value + 1;
      return x.get();
    });
    useAnimatedStyle(() => ({ opacity: y.get() }));
    return null;
  }
  await render(<Pair />);
  const mounted = runs;
  unread.set(1);
  expect(runs).toBe(mounted);
  y.set(1);
  expect(runs).toBe(mounted + 1);
  x.set(1);
  expect(runs).toBe(mounted + 2);
});

it("a reaction that writes back what its prepare reads reacts once per write", async () => {
  let x!: SharedValue<number>;
  const react = vi.fn((value: number) => {
    x.value = value;
  });
  function Echo() {
    x = useSharedValue(0);
    useAnimatedReaction(() => x.get(), react);
    return null;
  }
  await render(<Echo />);
  x.set(3);
  expect(react.mock.calls.map(([value]) => value)).toEqual([0, 3]);
  expect(x.get()).toBe(3);
});

it("a clamping reaction reacts to the write, and its own write waits for the next one", async () => {
  let x!: SharedValue<number>;
  const seen: number[] = [];
  function Clamp() {
    x = useSharedValue(0);
    useAnimatedReaction(
      () => x.get(),
      (value) => {
        seen.push(value);
        if (value > 10) x.value = 10;
      },
    );
    return null;
  }
  await render(<Clamp />);
  x.set(50);
  expect(seen).toEqual([0, 50]);
  expect(x.get()).toBe(10);
});

it("a derived value is current before a reaction that reads it, which runs once", async () => {
  let a!: SharedValue<number>;
  const calls: unknown[] = [];
  function Both() {
    a = useSharedValue(0);
    const d = useDerivedValue(() => a.get() * 2);
    useAnimatedReaction(
      () => [a.get(), d.get()],
      (now, previous) => {
        calls.push([now, previous]);
      },
    );
    return null;
  }
  await render(<Both />);
  calls.length = 0;
  a.set(1);
  expect(calls).toEqual([
    [
      [1, 2],
      [0, 0],
    ],
  ]);
});

it("a reaction a child starts before its parent's derived value still runs after it", async () => {
  // A child's effects run first, so its reaction starts before the derived value it reads;
  // the pass orders mappers by what they write and read, as Reanimated's does.
  let a!: SharedValue<number>;
  const calls: unknown[] = [];
  function Watcher({ a, d }: { a: SharedValue<number>; d: SharedValue<number> }) {
    useAnimatedReaction(
      () => [a.get(), d.get()],
      (now) => {
        calls.push(now);
      },
    );
    return null;
  }
  function Source() {
    a = useSharedValue(0);
    const d = useDerivedValue(() => a.get() * 2);
    return <Watcher a={a} d={d} />;
  }
  await render(<Source />);
  calls.length = 0;
  a.set(1);
  expect(calls).toEqual([[1, 2]]);
});

it("a reaction calls the latest render's prop", async () => {
  let x!: SharedValue<number>;
  const first = vi.fn();
  const second = vi.fn();
  function Notifier({ onChange }: { onChange: (value: number) => void }) {
    x = useSharedValue(0);
    useAnimatedReaction(
      () => x.get(),
      (value, previous) => {
        if (previous !== null) onChange(value);
      },
    );
    return null;
  }
  const { rerender } = await render(<Notifier onChange={first} />);
  await rerender(<Notifier onChange={second} />);
  x.set(5);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith(5);
});

it("a style in a render a Suspense boundary discards does not follow", async () => {
  let x!: SharedValue<number>;
  const updater = vi.fn(() => ({ opacity: x.get() }));
  const never = new Promise(() => {});
  function Suspends() {
    useAnimatedStyle(updater);
    throw never;
  }
  function Holder() {
    x = useSharedValue(0);
    return (
      <Suspense fallback={null}>
        <Suspends />
      </Suspense>
    );
  }
  await render(<Holder />);
  updater.mockClear();
  x.set(0.7);
  expect(updater).not.toHaveBeenCalled();
});

it("after unmount a write runs neither the updater nor the reaction", async () => {
  let x!: SharedValue<number>;
  const updater = vi.fn(() => ({ opacity: x.get() }));
  const react = vi.fn();
  function Child() {
    const style = useAnimatedStyle(updater);
    useAnimatedReaction(() => x.get(), react);
    return <Animated.View style={style} />;
  }
  function Holder({ show }: { show: boolean }) {
    x = useSharedValue(0);
    return show ? <Child /> : null;
  }
  const { rerender } = await render(<Holder show />);
  await rerender(<Holder show={false} />);
  updater.mockClear();
  react.mockClear();
  x.set(1);
  expect(updater).not.toHaveBeenCalled();
  expect(react).not.toHaveBeenCalled();
});

it("under StrictMode a reaction starts, stops and starts, as Reanimated's mapper does", async () => {
  const react = vi.fn();
  function Watcher() {
    const x = useSharedValue(0);
    useAnimatedReaction(() => x.get(), react);
    return null;
  }
  await render(
    <React.StrictMode>
      <Watcher />
    </React.StrictMode>,
  );
  expect(react.mock.calls).toEqual([
    [0, null],
    [0, 0],
  ]);
});

it("a reaction's state update from a write lands at the next act, as under Reanimated", async () => {
  let x!: SharedValue<number>;
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  function Shown() {
    x = useSharedValue(0);
    const [n, setN] = React.useState(0);
    useAnimatedReaction(
      () => x.get(),
      (value, previous) => {
        if (previous !== null) setN(value);
      },
    );
    return <Animated.Text testID="n">{String(n)}</Animated.Text>;
  }
  try {
    await render(<Shown />);
    await act(async () => {
      x.set(4);
    });
    expect(screen.getByTestId("n").props.children).toBe("4");
  } finally {
    error.mockRestore();
  }
});
