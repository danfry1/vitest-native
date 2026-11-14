// A card that fades its background from red to blue as a shared value moves.
import React from "react";
import { render, screen } from "@testing-library/react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { expect, test } from "vitest";

function Card() {
  const progress = useSharedValue(0.5);
  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ["#ff0000", "#0000ff"]),
  }));
  return <Animated.View testID="card" style={style} />;
}

test("a card that animates its colour renders it", async () => {
  await render(<Card />);
  expect(screen.getByTestId("card")).toHaveStyle({ backgroundColor: "rgba(186, 0, 186, 1)" });
});
