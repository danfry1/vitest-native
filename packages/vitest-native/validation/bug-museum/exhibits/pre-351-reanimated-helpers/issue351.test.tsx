// Reanimated's pure helpers, as installed.
import React from "react";
import { render } from "@testing-library/react-native";
import { clamp, interpolate, interpolateColor, isSharedValue, useSharedValue } from "react-native-reanimated";
import { expect, test } from "vitest";

test("interpolate, clamp and interpolateColor compute", () => {
  expect(interpolate(5, [0, 10], [0, 100]), "interpolate computes").toBe(50);
  expect(clamp(5, 0, 3), "clamp computes").toBe(3);
  expect(interpolateColor(0.5, [0, 1], ["#ff0000", "#0000ff"]), "interpolateColor computes").toMatch(/^rgba\(/);
});

test("isSharedValue recognises a shared value", async () => {
  expect(typeof isSharedValue, "Reanimated exports isSharedValue").toBe("function");
  let seen: unknown;
  function C() {
    seen = useSharedValue(0);
    return null;
  }
  await render(<C />);
  expect(isSharedValue(seen), "isSharedValue recognises a shared value").toBe(true);
  expect(isSharedValue({}), "isSharedValue rejects a plain object").toBe(false);
});
