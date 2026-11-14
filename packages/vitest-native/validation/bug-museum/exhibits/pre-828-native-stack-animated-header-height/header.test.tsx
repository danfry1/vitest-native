// A screen that pads its content by the native stack header's animated height.
import React from "react";
import { Animated } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { useAnimatedHeaderHeight } from "@react-navigation/native-stack";
import { expect, test } from "vitest";

function UnderHeader() {
  const headerHeight = useAnimatedHeaderHeight();
  return <Animated.View testID="screen" style={{ paddingTop: headerHeight }} />;
}

test("a screen that reads the animated header height renders", async () => {
  await render(<UnderHeader />);
  expect(screen.getByTestId("screen")).toBeTruthy();
});
