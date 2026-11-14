/**
 * The navigation preset's useAnimatedHeaderHeight (@react-navigation/native-stack, #828)
 * hands out real React Native's Animated value, as a native stack screen's NativeStackView
 * does, so a screen that pads itself by the header height renders as in the app.
 */
import React from "react";
import { Animated, StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { useAnimatedHeaderHeight } from "@react-navigation/native-stack";
import { expect, it } from "vitest";

it("useAnimatedHeaderHeight gives one real Animated value a style can use", async () => {
  const seen: unknown[] = [];
  function Padded() {
    const height = useAnimatedHeaderHeight();
    seen.push(height);
    return <Animated.View testID="padded" style={{ paddingTop: height }} />;
  }
  const { rerender } = await render(<Padded />);
  await rerender(<Padded />);
  expect(seen[0]).toBeInstanceOf(Animated.Value);
  expect(seen[1]).toBe(seen[0]);
  expect(StyleSheet.flatten(screen.getByTestId("padded").props.style)).toMatchObject({
    paddingTop: 64,
  });
});
