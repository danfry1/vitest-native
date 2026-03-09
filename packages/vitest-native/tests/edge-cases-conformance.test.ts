/**
 * Edge case conformance tests — covers boundary conditions and
 * unusual but valid usage patterns that could trip up mocks.
 */

import { describe, it, expect, vi } from "vitest";
import {
  Animated,
  StyleSheet,
  processColor,
} from "react-native";

// ---------------------------------------------------------------------------
// Animated.Value edge cases
// ---------------------------------------------------------------------------

describe("Animated.Value edge cases", () => {
  it("handles NaN value", () => {
    const val = new Animated.Value(NaN);
    expect(Number.isNaN(val.getValue())).toBe(true);
  });

  it("handles Infinity value", () => {
    const val = new Animated.Value(Infinity);
    expect(val.getValue()).toBe(Infinity);
  });

  it("handles negative values", () => {
    const val = new Animated.Value(-100);
    expect(val.getValue()).toBe(-100);
  });

  it("setValue to 0 triggers listeners", () => {
    const val = new Animated.Value(5);
    const listener = vi.fn();
    val.addListener(listener);
    val.setValue(0);
    expect(listener).toHaveBeenCalledWith({ value: 0 });
  });

  it("multiple rapid setValue calls trigger all listeners", () => {
    const val = new Animated.Value(0);
    const listener = vi.fn();
    val.addListener(listener);
    val.setValue(1);
    val.setValue(2);
    val.setValue(3);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls[2][0]).toEqual({ value: 3 });
  });

  it("stopAnimation without callback does not throw", () => {
    const val = new Animated.Value(42);
    expect(() => val.stopAnimation()).not.toThrow();
  });

  it("resetAnimation without callback does not throw", () => {
    const val = new Animated.Value(42);
    expect(() => val.resetAnimation()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Animated interpolation edge cases
// ---------------------------------------------------------------------------

describe("Animated interpolation edge cases", () => {
  it("interpolation with value at exact boundary", () => {
    const val = new Animated.Value(0);
    const interp = val.interpolate({
      inputRange: [0, 100],
      outputRange: [0, 1],
    });
    expect(interp.getValue()).toBe(0);
  });

  it("interpolation extends above max input by default", () => {
    const val = new Animated.Value(200);
    const interp = val.interpolate({
      inputRange: [0, 100],
      outputRange: [0, 1],
    });
    // RN default is extend: linear extrapolation → 2
    expect(interp.getValue()).toBe(2);
  });

  it("interpolation extends below min input by default", () => {
    const val = new Animated.Value(-50);
    const interp = val.interpolate({
      inputRange: [0, 100],
      outputRange: [0, 1],
    });
    // RN default is extend: linear extrapolation → -0.5
    expect(interp.getValue()).toBe(-0.5);
  });

  it("interpolation with 3-segment range", () => {
    const val = new Animated.Value(50);
    const interp = val.interpolate({
      inputRange: [0, 50, 100],
      outputRange: [0, 0.5, 1],
    });
    expect(interp.getValue()).toBeCloseTo(0.5);
  });

  it("interpolation with reverse outputRange", () => {
    const val = new Animated.Value(0);
    const interp = val.interpolate({
      inputRange: [0, 100],
      outputRange: [1, 0],
    });
    expect(interp.getValue()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// StyleSheet edge cases
// ---------------------------------------------------------------------------

describe("StyleSheet edge cases", () => {
  it("flatten deeply nested arrays", () => {
    const result = StyleSheet.flatten([
      [{ flex: 1 }, [{ color: "red" }, { fontSize: 14 }]],
      { margin: 10 },
    ]);
    expect(result).toEqual({ flex: 1, color: "red", fontSize: 14, margin: 10 });
  });

  it("flatten with all falsy values returns undefined", () => {
    expect(StyleSheet.flatten([null, undefined, false])).toBeUndefined();
  });

  it("flatten empty array returns undefined", () => {
    expect(StyleSheet.flatten([])).toBeUndefined();
  });

  it("create preserves object references", () => {
    const styles = StyleSheet.create({
      a: { flex: 1 },
      b: { flex: 2 },
    });
    // create should return the same objects
    expect(styles.a).toEqual({ flex: 1 });
    expect(styles.b).toEqual({ flex: 2 });
  });
});

// ---------------------------------------------------------------------------
// processColor edge cases
// ---------------------------------------------------------------------------

describe("processColor additional edge cases", () => {
  it("handles #000 shorthand", () => {
    expect(processColor("#000")).toBe(0xff000000 >>> 0);
  });

  it("handles #FFF shorthand", () => {
    expect(processColor("#FFF")).toBe(0xffffffff >>> 0);
  });

  it("handles transparent named color", () => {
    expect(processColor("transparent")).toBe(0x00000000);
  });

  it("rgb with max values", () => {
    expect(processColor("rgb(255, 255, 255)")).toBe(0xffffffff >>> 0);
  });

  it("rgb with zero values", () => {
    expect(processColor("rgb(0, 0, 0)")).toBe(0xff000000 >>> 0);
  });
});
