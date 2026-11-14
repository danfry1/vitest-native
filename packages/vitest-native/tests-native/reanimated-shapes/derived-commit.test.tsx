/**
 * A derived value follows its inputs from the commit on, as Reanimated starts its mapper
 * in an effect: a render React discards follows nothing, an update that reads a new input
 * recomputes once it commits (a child's effect may already have written that input), and
 * an updater that writes a value it reads does not run again inside itself.
 */
import React, { Suspense } from "react";
import { render } from "@testing-library/react-native";
import { type SharedValue, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { expect, it, vi } from "vitest";

it("a derived value in a render a Suspense boundary discards does not follow", async () => {
  let x!: SharedValue<number>;
  const updater = vi.fn(() => x.get());
  const never = new Promise(() => {});
  function Suspends() {
    useDerivedValue(updater);
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
  x.set(1);
  x.set(2);
  expect(updater).not.toHaveBeenCalled();
});

it("a derived value in a render an error boundary discards does not follow", async () => {
  let x!: SharedValue<number>;
  const updater = vi.fn(() => x.get());
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    render() {
      return this.state.failed ? null : this.props.children;
    }
  }
  function Throws(): null {
    useDerivedValue(updater);
    throw new Error("render failed");
  }
  function Holder() {
    x = useSharedValue(0);
    return (
      <Boundary>
        <Throws />
      </Boundary>
    );
  }
  try {
    await render(<Holder />);
    updater.mockClear();
    x.set(1);
    expect(updater).not.toHaveBeenCalled();
  } finally {
    error.mockRestore();
  }
});

/** A component whose derived value reads `a`, or `b` once `useB`; `Writer` sets `b`. */
function switching(effect: typeof React.useEffect) {
  const held = {} as { a: SharedValue<number>; b: SharedValue<number>; d: SharedValue<number> };
  function Writer({ value }: { value: number }) {
    effect(() => {
      if (value > 0) held.b.set(value);
    }, [value]);
    return null;
  }
  function Switch({ useB, value }: { useB: boolean; value: number }) {
    const a = useSharedValue(1);
    const b = useSharedValue(10);
    held.a = a;
    held.b = b;
    held.d = useDerivedValue(() => (useB ? b.get() : a.get()));
    return <Writer value={value} />;
  }
  return { held, Switch };
}

it.each([
  ["layout", React.useLayoutEffect],
  ["passive", React.useEffect],
] as const)(
  "an update that reads a new input sees a child's %s effect write it in the same commit",
  async (_kind, effect) => {
    const { held, Switch } = switching(effect);
    const { rerender } = await render(<Switch useB={false} value={0} />);
    await rerender(<Switch useB value={99} />);
    expect(held.d.get()).toBe(99);
    held.b.set(7);
    expect(held.d.get()).toBe(7);
  },
);

it("after an update switches its input, the old input no longer drives it", async () => {
  const { held, Switch } = switching(React.useEffect);
  const { rerender } = await render(<Switch useB={false} value={0} />);
  await rerender(<Switch useB value={0} />);
  expect(held.d.get()).toBe(10);
  held.b.set(20);
  expect(held.d.get()).toBe(20);
  held.a.set(5);
  expect(held.d.get()).toBe(20);
});

it("under StrictMode it follows after mount", async () => {
  let x!: SharedValue<number>;
  let d!: SharedValue<number>;
  function Doubler() {
    x = useSharedValue(0);
    d = useDerivedValue(() => x.get() * 2);
    return null;
  }
  await render(
    <React.StrictMode>
      <Doubler />
    </React.StrictMode>,
  );
  x.set(3);
  expect(d.get()).toBe(6);
});

it("a memoized child and a cached element follow while their parent re-renders", async () => {
  let x!: SharedValue<number>;
  const seen: Record<string, SharedValue<number>> = {};
  const Child = React.memo(function Child({ v, name }: { v: SharedValue<number>; name: string }) {
    seen[name] = useDerivedValue(() => v.get() + 1);
    return null;
  });
  function Tick({ n }: { n: number }) {
    return n < 0 ? <></> : null;
  }
  function Parent({ tick }: { tick: number }) {
    x = useSharedValue(0);
    // What React Compiler emits for an element with stable inputs: a cached element.
    const cached = React.useMemo(() => <Child v={x} name="cached" />, [x]);
    return (
      <>
        <Child v={x} name="memo" />
        {cached}
        <Tick n={tick} />
      </>
    );
  }
  const { rerender } = await render(<Parent tick={0} />);
  await rerender(<Parent tick={1} />);
  await rerender(<Parent tick={2} />);
  x.set(41);
  expect(seen.memo.get()).toBe(42);
  expect(seen.cached.get()).toBe(42);
});

it("the updater runs at render and on mount, once per write, and once per update render", async () => {
  let x!: SharedValue<number>;
  const updater = vi.fn(() => x.get());
  function Follower({ tick }: { tick: number }) {
    void tick;
    x = useSharedValue(0);
    useDerivedValue(updater);
    return null;
  }
  const { rerender } = await render(<Follower tick={0} />);
  expect(updater).toHaveBeenCalledTimes(2);
  x.set(1);
  expect(updater).toHaveBeenCalledTimes(3);
  // The same inputs: the render's run, and none after the commit.
  await rerender(<Follower tick={1} />);
  expect(updater).toHaveBeenCalledTimes(4);
});

it("an updater that writes a value it reads does not run again inside itself", async () => {
  // Reanimated's mapperRun returns while mappers are processing, so the inner write marks
  // the mapper dirty and it runs on the next write.
  let x!: SharedValue<number>;
  let d!: SharedValue<number>;
  let runs = 0;
  function Counter() {
    x = useSharedValue(0);
    const count = useSharedValue(0);
    d = useDerivedValue(() => {
      runs++;
      count.value = count.value + 1;
      return x.get() * 2;
    });
    return null;
  }
  await render(<Counter />);
  const mounted = runs;
  expect(mounted).toBe(2);
  x.set(4);
  expect(runs).toBe(mounted + 1);
  expect(d.get()).toBe(8);
});
