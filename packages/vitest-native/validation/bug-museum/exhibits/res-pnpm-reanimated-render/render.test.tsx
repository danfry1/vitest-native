// Reanimated rendering an animated style from a pnpm-shaped store directory.
import React from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "vitest";

function Box() {
  const width = useSharedValue(42);
  const style = useAnimatedStyle(() => ({ width: width.value }));
  return <Animated.View testID="box" style={style} />;
}

test("an animated style renders its shared value", async () => {
  await render(<Box />);
  expect(StyleSheet.flatten(screen.getByTestId("box").props.style)).toMatchObject({ width: 42 });
});
