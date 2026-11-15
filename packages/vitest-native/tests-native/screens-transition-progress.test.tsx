/**
 * Under the native engine the screens preset's useTransitionProgress hands out real React
 * Native's Animated values (presets/active-react-native.ts), so a screen that interpolates
 * them into an Animated.View style renders as in the app.
 */
import React from "react";
import { Animated, StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { useTransitionProgress } from "react-native-screens";
import { expect, it } from "vitest";

it("useTransitionProgress gives real Animated values a style can interpolate", async () => {
  let values!: ReturnType<typeof useTransitionProgress>;
  function Fading() {
    values = useTransitionProgress();
    const opacity = values.progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
    return <Animated.View testID="fading" style={{ opacity }} />;
  }
  await render(<Fading />);
  expect(values.progress).toBeInstanceOf(Animated.Value);
  expect(values.closing).toBeInstanceOf(Animated.Value);
  expect(values.goingForward).toBeInstanceOf(Animated.Value);
  expect(StyleSheet.flatten(screen.getByTestId("fading").props.style)).toMatchObject({
    opacity: 0.5,
  });
});
