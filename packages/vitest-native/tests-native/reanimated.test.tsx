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
  // helpers and handlers in their place, and nothing else (REANIMATED_MOCK.extend).
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
});
