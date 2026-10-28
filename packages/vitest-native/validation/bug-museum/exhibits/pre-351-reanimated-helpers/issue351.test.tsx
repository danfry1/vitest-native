// Reanimated's pure helpers, as installed.
import React from "react";
import { render } from "@testing-library/react-native";
import { clamp, interpolate, interpolateColor, isSharedValue, useSharedValue } from "react-native-reanimated";
import { expect, test } from "vitest";

test("interpolate, clamp and interpolateColor compute", () => {
  expect(interpolate(5, [0, 10], [0, 100])).toBe(50);
  expect(clamp(5, 0, 3)).toBe(3);
  expect(interpolateColor(0.5, [0, 1], ["#ff0000", "#0000ff"])).toMatch(/^rgba\(/);
});

test("isSharedValue recognises a shared value", async () => {
  let seen: unknown;
  function C() {
    seen = useSharedValue(0);
    return null;
  }
  await render(<C />);
  expect(isSharedValue(seen)).toBe(true);
  expect(isSharedValue({})).toBe(false);
});
