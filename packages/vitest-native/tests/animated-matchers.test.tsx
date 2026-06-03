/**
 * Tests for the reanimated-compatible matchers `toHaveAnimatedStyle` and
 * `toHaveAnimatedProps`, auto-registered by vitest-native's setup.
 *
 * The matchers read straight from a rendered element's `style` / `animatedProps`,
 * which is exactly what the reanimated preset produces. We drive them both
 * directly (plain elements) and through the real reanimated preset factory so
 * the whole hook → render → matcher pipeline is covered without needing
 * react-native-reanimated installed.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { View, Text, StyleSheet } from "react-native";
import { reanimated } from "../src/presets/index.js";

const rea = reanimated().modules["react-native-reanimated"].factory();

describe("toHaveAnimatedStyle", () => {
  it("matches a subset of the element's style", () => {
    render(<View testID="box" style={{ opacity: 1, width: 100 }} />);
    expect(screen.getByTestId("box")).toHaveAnimatedStyle({ opacity: 1 });
  });

  it("fails when the value differs", () => {
    render(<View testID="box" style={{ opacity: 0.5 }} />);
    expect(screen.getByTestId("box")).not.toHaveAnimatedStyle({ opacity: 1 });
  });

  it("flattens style arrays", () => {
    const styles = StyleSheet.create({ base: { width: 50 } });
    render(<View testID="box" style={[styles.base, { opacity: 0.2 }]} />);
    expect(screen.getByTestId("box")).toHaveAnimatedStyle({ opacity: 0.2, width: 50 });
  });

  it("matches all props when shouldMatchAllProps is set", () => {
    render(<View testID="box" style={{ opacity: 1, width: 100 }} />);
    expect(screen.getByTestId("box")).toHaveAnimatedStyle(
      { opacity: 1, width: 100 },
      { shouldMatchAllProps: true },
    );
    expect(screen.getByTestId("box")).not.toHaveAnimatedStyle(
      { opacity: 1 },
      { shouldMatchAllProps: true },
    );
  });

  it("works end-to-end through the reanimated preset", () => {
    const AnimatedView = rea.createAnimatedComponent(View);
    function Box() {
      const opacity = rea.useSharedValue(1);
      const style = rea.useAnimatedStyle(() => ({ opacity: opacity.value }));
      return (
        <AnimatedView testID="animated" style={style}>
          <Text>Hello</Text>
        </AnimatedView>
      );
    }
    render(<Box />);
    expect(screen.getByTestId("animated")).toHaveAnimatedStyle({ opacity: 1 });
  });
});

describe("toHaveAnimatedProps", () => {
  it("reads from the animatedProps prop", () => {
    render(<View testID="box" {...{ animatedProps: { fill: "red" } }} />);
    expect(screen.getByTestId("box")).toHaveAnimatedProps({ fill: "red" });
  });

  it("falls back to the element's own props", () => {
    render(<View testID="box" {...{ pointerEvents: "none" }} />);
    expect(screen.getByTestId("box")).toHaveAnimatedProps({ pointerEvents: "none" });
  });

  it("fails when the value differs", () => {
    render(<View testID="box" {...{ animatedProps: { fill: "blue" } }} />);
    expect(screen.getByTestId("box")).not.toHaveAnimatedProps({ fill: "red" });
  });

  it("works end-to-end through the reanimated preset", () => {
    const AnimatedView = rea.createAnimatedComponent(View);
    function Box() {
      const progress = rea.useSharedValue(0.75);
      const animatedProps = rea.useAnimatedProps(() => ({ accessibilityValue: progress.value }));
      return <AnimatedView testID="animated" animatedProps={animatedProps} />;
    }
    render(<Box />);
    expect(screen.getByTestId("animated")).toHaveAnimatedProps({ accessibilityValue: 0.75 });
  });
});
