// Reanimated rendering an animated style, in every layout. In a pnpm store reanimated's
// own directory carries worklets' name (its peer), so the same substring check (#349)
// narrowed every reanimated file, not only the ones its resolver lists.
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
