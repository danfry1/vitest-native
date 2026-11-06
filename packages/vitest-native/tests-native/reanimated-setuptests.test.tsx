/**
 * Reanimated's testing docs tell every suite to call setUpTests(), and a suite migrated
 * from Jest keeps the setup file that does. Under the native engine, with Reanimated
 * 4.7+, react-native-reanimated is Reanimated's own mock, which exports the real
 * setUpTests(): it registered Reanimated's toHaveAnimatedStyle over the engine's, and
 * Reanimated's reads props this mock's components never set, so every animated-style
 * assertion after the call failed with "Received: {}".
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import Animated, * as Reanimated from "react-native-reanimated";
import { describe, expect, it } from "vitest";

const setUpTests = (Reanimated as unknown as { setUpTests: (config?: object) => void }).setUpTests;

function Box() {
  const opacity = Reanimated.useSharedValue(0.5);
  const style = Reanimated.useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View testID="box" style={[{ width: 10 }, style]} />;
}

describe("Reanimated's setUpTests() under its own mock", () => {
  it("is Reanimated's own mock here", () => {
    expect(typeof (Reanimated as Record<string, unknown>).getAnimatedStyle).toBe("function");
    expect(typeof setUpTests).toBe("function");
  });

  it("leaves the animated matchers working", async () => {
    await render(<Box />);
    expect(screen.getByTestId("box")).toHaveAnimatedStyle({ opacity: 0.5 });
    setUpTests();
    expect(screen.getByTestId("box")).toHaveAnimatedStyle({ opacity: 0.5 });
    expect(screen.getByTestId("box")).toHaveAnimatedProps({ testID: "box" });
    setUpTests({ fps: 120 });
    expect(screen.getByTestId("box")).toHaveAnimatedStyle({ opacity: 0.5, width: 10 });
  });

  // Reanimated's real AnimatedComponent adds these under Jest, and projects strip them
  // with a snapshot serializer; migrate reports such a serializer as deletable.
  it("renders none of Reanimated's Jest-only props", async () => {
    await render(<Box />);
    const props = screen.getByTestId("box").props;
    for (const prop of ["jestAnimatedProps", "jestAnimatedStyle", "jestInlineStyle"]) {
      expect(props).not.toHaveProperty(prop);
    }
  });

  it("leaves the global expect as it was", () => {
    const global = globalThis as Record<string, unknown>;
    const before = global.expect;
    const had = Object.prototype.hasOwnProperty.call(global, "expect");
    setUpTests();
    expect(Object.prototype.hasOwnProperty.call(global, "expect")).toBe(had);
    expect(global.expect).toBe(before);
  });
});
