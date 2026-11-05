/**
 * Reanimated under the native engine. The preset's module is reanimated's own test
 * mock (`react-native-reanimated/mock`), as a Jest suite gets it with
 * `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`,
 * over the real package and the real react-native-worklets in their JS
 * implementations, which load through the libraries' own Jest resolvers
 * (native/jest-resolvers.mjs). Wrapped components render through real React Native.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Text, Pressable } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  clamp,
  css,
  interpolate,
  interpolateColor,
  isSharedValue,
  useAnimatedScrollHandler,
  useComposedEventHandler,
  useScrollOffset,
  useScrollViewOffset,
  useAnimatedRef,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import * as Reanimated from "react-native-reanimated";

function Box() {
  const width = useSharedValue(100);
  const style = useAnimatedStyle(() => ({ width: width.value }));
  return (
    <Animated.View testID="box" style={style}>
      <Text>hi</Text>
    </Animated.View>
  );
}

function Toggle() {
  const [label, setLabel] = React.useState("idle");
  const opacity = useSharedValue(1);
  const onPress = () => {
    // withTiming resolves synchronously in the mock; runOnJS is identity.
    opacity.value = withTiming(0, undefined, () => runOnJS(setLabel)("done"));
  };
  return (
    <Pressable onPress={onPress}>
      <Text>{label}</Text>
    </Pressable>
  );
}

describe("react-native-reanimated under native engine", () => {
  it("Animated.View renders through real RN (queryable by testID + child text)", async () => {
    await render(<Box />);
    expect(screen.getByTestId("box")).toBeTruthy();
    expect(screen.getByText("hi")).toBeTruthy();
  });

  it("useSharedValue / useAnimatedStyle are the shadowed mock (no worklets crash)", () => {
    // If real reanimated had loaded, importing it would have thrown on worklets.
    expect(typeof useSharedValue).toBe("function");
    expect(typeof useAnimatedStyle).toBe("function");
    // oxlint-disable-next-line import/no-named-as-default-member -- default API parity is intentional
    expect(typeof Animated.createAnimatedComponent).toBe("function");
  });

  it("withTiming + runOnJS drive a real state update via real Pressable", async () => {
    await render(<Toggle />);
    expect(screen.getByText("idle")).toBeTruthy();
    await fireEvent.press(screen.getByText("idle"));
    expect(screen.getByText("done")).toBeTruthy();
  });

  it("createAnimatedComponent wraps a custom component", async () => {
    const Custom = (props: any) => <Text {...props}>wrapped</Text>;
    // oxlint-disable-next-line import/no-named-as-default-member -- default API parity is intentional
    const AnimatedCustom = Animated.createAnimatedComponent(Custom);
    await render(<AnimatedCustom testID="custom" />);
    expect(screen.getByText("wrapped")).toBeTruthy();
  });

  it("is reanimated's own mock: its whole API, and its callbacks' arguments", () => {
    // Names the hand-written preset lacked, which reanimated's mock provides.
    for (const name of ["interpolateColor", "clamp", "Keyframe", "getAnimatedStyle"]) {
      expect(typeof (Reanimated as Record<string, unknown>)[name], name).toBe("function");
    }
    expect(typeof interpolateColor).toBe("function");
    expect(typeof Easing.out(Easing.exp)).toBe("function");
    // The mock calls an animation's callback with `true` (finished), as the real
    // AnimationCallback type declares; the hand-written preset passed an object.
    const finished: unknown[] = [];
    withTiming(1, {}, (done?: boolean) => finished.push(done));
    withSpring(1, {}, (done?: boolean) => finished.push(done));
    expect(finished).toEqual([true, true]);
  });

  // Reanimated's mock answers these with no-ops; the preset puts reanimated's own
  // helpers and working handlers in their place, and nothing else (mockCorrections).
  it("interpolates with reanimated's own helpers", () => {
    expect(interpolate(5, [0, 10], [0, 100])).toBe(50);
    expect(interpolate(20, [0, 10], [0, 100], Extrapolation.CLAMP)).toBe(100);
    expect(interpolate(20, [0, 10], [0, 100])).toBe(200);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(interpolateColor(0, [0, 1], ["#ff0000", "#0000ff"])).toBe("rgba(255, 0, 0, 1)");
    expect(interpolateColor(1, [0, 1], ["#ff0000", "#0000ff"])).toBe("rgba(0, 0, 255, 1)");
    // oxlint-disable-next-line import/no-named-as-default-member -- default API parity is intentional
    expect(Animated.interpolate(5, [0, 10], [0, 100])).toBe(50);
  });

  it("runs a scroll handler, alone and composed, on its scroll view's scroll events", async () => {
    const seen: number[] = [];
    const composed: string[] = [];
    function List() {
      const onScroll = useAnimatedScrollHandler({
        onScroll: (event, context: { calls?: number }) => {
          context.calls = (context.calls ?? 0) + 1;
          seen.push(event.contentOffset.y, context.calls);
        },
      });
      const both = useComposedEventHandler([onScroll, () => composed.push("other")]);
      return (
        <Animated.ScrollView testID="list" onScroll={both}>
          <Text>row</Text>
        </Animated.ScrollView>
      );
    }
    await render(<List />);
    await fireEvent.scroll(screen.getByTestId("list"), {
      nativeEvent: { contentOffset: { y: 40 } },
    });
    await fireEvent.scroll(screen.getByTestId("list"), {
      nativeEvent: { contentOffset: { y: 80 } },
    });
    // The payload, and a context kept between events.
    expect(seen).toEqual([40, 1, 80, 2]);
    expect(composed).toEqual(["other", "other"]);
  });

  it("tells shared values apart, and keeps css keyframes as reanimated builds them", async () => {
    let value: unknown;
    function Fade() {
      value = useSharedValue(0);
      const fade = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
      return (
        <Animated.View testID="fade" style={{ animationName: fade, animationDuration: 200 }}>
          <Text>fade</Text>
        </Animated.View>
      );
    }
    await render(<Fade />);
    expect(isSharedValue(value)).toBe(true);
    expect(isSharedValue({ value: 0 })).toBe(false);
    const style = screen.getByTestId("fade").props.style;
    expect(style.animationDuration).toBe(200);
    expect(style.animationName.cssRules).toEqual({ from: { opacity: 0 }, to: { opacity: 1 } });
  });

  it("passes drag and momentum events to a scroll handler, as reanimated's scroll views do", async () => {
    const seen: string[] = [];
    function List() {
      const onScroll = useAnimatedScrollHandler({
        onScroll: () => seen.push("scroll"),
        onBeginDrag: () => seen.push("begin"),
        onEndDrag: () => seen.push("end"),
        onMomentumBegin: () => seen.push("momentum begin"),
        onMomentumEnd: (event) => seen.push(`momentum end ${event.contentOffset.y}`),
      });
      return (
        <Animated.ScrollView
          testID="list"
          onScroll={onScroll}
          onScrollEndDrag={() => seen.push("own")}
        >
          <Text>row</Text>
        </Animated.ScrollView>
      );
    }
    await render(<List />);
    const list = screen.getByTestId("list");
    const event = { nativeEvent: { contentOffset: { y: 9 } } };
    await fireEvent(list, "scrollBeginDrag", event);
    await fireEvent.scroll(list, event);
    await fireEvent(list, "scrollEndDrag", event);
    await fireEvent(list, "momentumScrollBegin", event);
    await fireEvent(list, "momentumScrollEnd", event);
    // The scroll view's own onScrollEndDrag still runs.
    expect(seen).toEqual(["begin", "scroll", "end", "own", "momentum begin", "momentum end 9"]);
  });

  it("keeps one scroll handler across renders, running the latest render's handlers", async () => {
    const built: unknown[] = [];
    const seen: number[] = [];
    function List({ id }: { id: number }) {
      const onScroll = useAnimatedScrollHandler({ onScroll: () => seen.push(id) });
      built.push(onScroll);
      return (
        <Animated.ScrollView testID="list" onScroll={onScroll}>
          <Text>row</Text>
        </Animated.ScrollView>
      );
    }
    const { rerender } = await render(<List id={1} />);
    await rerender(<List id={2} />);
    await fireEvent.scroll(screen.getByTestId("list"), {
      nativeEvent: { contentOffset: { y: 1 } },
    });
    expect(built[0]).toBe(built[built.length - 1]);
    expect(seen).toEqual([2]);
  });

  it("gives scroll offsets as shared values", async () => {
    const offsets: unknown[] = [];
    function List() {
      const ref = useAnimatedRef<any>();
      offsets.push(useScrollOffset(ref), useScrollViewOffset(ref));
      return (
        <Animated.ScrollView ref={ref}>
          <Text>row</Text>
        </Animated.ScrollView>
      );
    }
    await render(<List />);
    for (const offset of offsets) {
      expect(isSharedValue(offset)).toBe(true);
      expect((offset as { get(): number }).get()).toBe(0);
    }
  });

  it("gives shared values listeners, called on .value and .set()", async () => {
    let shared: any;
    function Holder() {
      shared = useSharedValue(1);
      return <Text>box</Text>;
    }
    await render(<Holder />);
    const seen: unknown[] = [];
    expect("addListener" in shared && "removeListener" in shared).toBe(true);
    shared.addListener(1, (value: unknown) => seen.push(value));
    shared.value = 2;
    shared.set(3);
    shared.set((current: number) => current + 1);
    shared.removeListener(1);
    shared.value = 5;
    expect(seen).toEqual([2, 3, 4]);
    expect(shared.get()).toBe(5);
    expect(isSharedValue(shared)).toBe(true);
  });
});

describe("useSharedValue's listeners across renders", () => {
  it("keeps one value per component, so a listener hears a later render's write", async () => {
    const seen: Array<{
      value: number;
      addListener?: (id: number, f: (v: number) => void) => void;
    }> = [];
    function Holder({ n }: { n: number }) {
      seen.push(Reanimated.useSharedValue(0) as never);
      return <Text>{`render ${n}`}</Text>;
    }
    const view = await render(<Holder n={1} />);
    await view.rerender(<Holder n={2} />);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    const heard: number[] = [];
    seen[0]!.addListener?.(1, (v) => heard.push(v));
    seen[1]!.value = 5;
    expect(heard).toEqual([5]);
  });
});
