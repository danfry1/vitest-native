// A screen that fades in with its native-stack transition.
import React from "react";
import { Animated } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { useTransitionProgress } from "react-native-screens";
import { expect, test } from "vitest";

function FadeIn() {
  const { progress } = useTransitionProgress();
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  return <Animated.View testID="screen" style={{ opacity }} />;
}

test("a screen that interpolates its transition progress renders", async () => {
  await render(<FadeIn />);
  expect(screen.getByTestId("screen")).toBeTruthy();
});
