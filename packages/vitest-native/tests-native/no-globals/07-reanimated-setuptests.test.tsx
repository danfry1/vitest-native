/**
 * With Vitest's `globals: false`, Reanimated's own setUpTests() runs against an `expect`
 * whose extend does nothing, as with globals on: the global it reads is put back as it
 * was, and the engine's animated matchers keep working. The mock engine's reanimated
 * module has no setUpTests.
 */
import React from "react";
import { render, screen } from "@testing-library/react-native";
import Animated, * as Reanimated from "react-native-reanimated";
import { expect, it } from "vitest";

const setUpTests = (Reanimated as Record<string, unknown>).setUpTests as
  | ((config?: object) => void)
  | undefined;

it.skipIf(process.env.VN_NO_GLOBALS_MODE === "mock-noiso")(
  "runs Reanimated's setUpTests() and keeps the animated matchers",
  async () => {
    function Box() {
      const opacity = Reanimated.useSharedValue(0.5);
      const style = Reanimated.useAnimatedStyle(() => ({ opacity: opacity.value }));
      return <Animated.View testID="box" style={style} />;
    }
    await render(<Box />);
    expect(typeof setUpTests).toBe("function");
    const global = globalThis as Record<string, unknown>;
    const had = Object.prototype.hasOwnProperty.call(global, "expect");
    const before = global.expect;
    setUpTests!();
    expect(Object.prototype.hasOwnProperty.call(global, "expect")).toBe(had);
    expect(global.expect).toBe(before);
    expect(screen.getByTestId("box")).toHaveAnimatedStyle({ opacity: 0.5 });
  },
);
