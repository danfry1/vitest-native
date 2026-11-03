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
  interpolateColor,
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
});
