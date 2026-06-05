/**
 * P0a proof: a third-party native-runtime library (Reanimated) works under the
 * native engine. Reanimated 4 cannot run in Node — it pulls in
 * react-native-worklets (native). So `engine: 'native'` must SHADOW it with the
 * vitest-native preset mock (same way Jest mocks it), while still rendering the
 * wrapped component through REAL React Native.
 *
 * react-native-reanimated is installed as a devDependency so this proves the real
 * package is present and correctly shadowed by the auto-detected preset — never
 * loaded (loading it would crash on the worklets native boundary).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Text, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

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
  it("Animated.View renders through real RN (queryable by testID + child text)", () => {
    render(<Box />);
    expect(screen.getByTestId("box")).toBeTruthy();
    expect(screen.getByText("hi")).toBeTruthy();
  });

  it("useSharedValue / useAnimatedStyle are the shadowed mock (no worklets crash)", () => {
    // If real reanimated had loaded, importing it would have thrown on worklets.
    expect(typeof useSharedValue).toBe("function");
    expect(typeof useAnimatedStyle).toBe("function");
    expect(typeof Animated.createAnimatedComponent).toBe("function");
  });

  it("withTiming + runOnJS drive a real state update via real Pressable", () => {
    render(<Toggle />);
    expect(screen.getByText("idle")).toBeTruthy();
    fireEvent.press(screen.getByText("idle"));
    expect(screen.getByText("done")).toBeTruthy();
  });

  it("createAnimatedComponent wraps a custom component", () => {
    const Custom = (props: any) => <Text {...props}>wrapped</Text>;
    const AnimatedCustom = Animated.createAnimatedComponent(Custom);
    render(<AnimatedCustom testID="custom" />);
    expect(screen.getByText("wrapped")).toBeTruthy();
  });
});
