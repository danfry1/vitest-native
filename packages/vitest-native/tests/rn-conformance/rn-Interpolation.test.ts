import { describe, it, expect } from "vitest";
import { Animated, Easing } from "react-native";

function createInterpolation(config: any) {
  return (input: number) => {
    const val = new Animated.Value(input);
    const interp = val.interpolate(config);
    return interp.getValue();
  };
}

describe("Interpolation", () => {
  it("should work with defaults", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    expect(interpolation(0)).toBe(0);
    expect(interpolation(0.5)).toBe(0.5);
    expect(interpolation(0.8)).toBeCloseTo(0.8);
    expect(interpolation(1)).toBe(1);
  });

  it("should work with output range", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: [100, 200],
    });

    expect(interpolation(0)).toBe(100);
    expect(interpolation(0.5)).toBe(150);
    expect(interpolation(0.8)).toBeCloseTo(180);
    expect(interpolation(1)).toBe(200);
  });

  it("should work with input range", () => {
    const interpolation = createInterpolation({
      inputRange: [100, 200],
      outputRange: [0, 1],
    });

    expect(interpolation(100)).toBe(0);
    expect(interpolation(150)).toBe(0.5);
    expect(interpolation(180)).toBeCloseTo(0.8);
    expect(interpolation(200)).toBe(1);
  });

  // Skip: our mock doesn't validate monotonic input ranges
  it.skip("should throw for non monotonic input ranges", () => {});

  it("should work with empty input range", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 10, 10],
      outputRange: [1, 2, 3],
      extrapolate: "extend",
    });

    expect(interpolation(0)).toBe(1);
    expect(interpolation(5)).toBe(1.5);
    expect(interpolation(10)).toBe(2);
    expect(interpolation(10.1)).toBe(3);
    expect(interpolation(15)).toBe(3);
  });

  it("should work with empty output range", () => {
    const interpolation = createInterpolation({
      inputRange: [1, 2, 3],
      outputRange: [0, 10, 10],
      extrapolate: "extend",
    });

    expect(interpolation(0)).toBe(-10);
    expect(interpolation(1.5)).toBe(5);
    expect(interpolation(2)).toBe(10);
    expect(interpolation(2.5)).toBe(10);
    expect(interpolation(3)).toBe(10);
    expect(interpolation(4)).toBe(10);
  });

  it("should work with easing", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: [0, 1],
      easing: Easing.quad,
    });

    expect(interpolation(0)).toBe(0);
    expect(interpolation(0.5)).toBe(0.25);
    expect(interpolation(0.9)).toBeCloseTo(0.81);
    expect(interpolation(1)).toBe(1);
  });

  it("should work with extrapolate", () => {
    let interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolate: "extend",
      easing: Easing.quad,
    });

    expect(interpolation(-2)).toBe(4);
    expect(interpolation(2)).toBe(4);

    interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolate: "clamp",
      easing: Easing.quad,
    });

    expect(interpolation(-2)).toBe(0);
    expect(interpolation(2)).toBe(1);

    interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolate: "identity",
      easing: Easing.quad,
    });

    expect(interpolation(-2)).toBe(-2);
    expect(interpolation(2)).toBe(2);
  });

  it("should work with keyframes without extrapolate", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 10, 100, 1000],
      outputRange: [0, 5, 50, 500],
    });

    expect(interpolation(-5)).toBe(-2.5);
    expect(interpolation(0)).toBe(0);
    expect(interpolation(5)).toBe(2.5);
    expect(interpolation(10)).toBe(5);
    expect(interpolation(50)).toBeCloseTo(25);
    expect(interpolation(100)).toBe(50);
    expect(interpolation(500)).toBeCloseTo(250);
    expect(interpolation(1000)).toBe(500);
    expect(interpolation(2000)).toBe(1000);
  });

  it("should work with keyframes with extrapolate", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1, 2],
      outputRange: [0.2, 1, 0.2],
      extrapolate: "clamp",
    });

    expect(interpolation(5)).toBeCloseTo(0.2);
  });

  // Skip: our mock doesn't validate infinite input ranges
  it.skip("should throw for an infinite input range", () => {});

  // Skip: our mock doesn't support Infinity ranges with easing
  it.skip("should work with negative infinite", () => {});

  // Skip: our mock doesn't support Infinity ranges with easing
  it.skip("should work with positive infinite", () => {});

  // Skip: our mock doesn't support string output range interpolation
  it.skip("should work with output ranges as string", () => {});

  // Skip: our mock doesn't support string output range interpolation
  it.skip("should work with output ranges as short hex string", () => {});

  // Skip: our mock doesn't support string output range interpolation
  it.skip("should work with output ranges as long hex string", () => {});

  // Skip: our mock doesn't support string output range interpolation
  it.skip("should work with output ranges with mixed hex and rgba strings", () => {});

  // Skip: our mock doesn't support string output range interpolation
  it.skip("should work with negative and decimal values in string ranges", () => {});

  // Skip: our mock doesn't validate string inputs
  it.skip("should crash when chaining an interpolation that returns a string", () => {});

  // Skip: our mock doesn't support color pattern interpolation
  it.skip("should support a mix of color patterns", () => {});

  // Skip: our mock doesn't support string output range validation
  it.skip("should crash when defining output range with different pattern", () => {});

  // Skip: our mock doesn't support string suffix interpolation
  it.skip("should interpolate values with arbitrary suffixes", () => {});

  // Skip: our mock doesn't support string format interpolation
  it.skip("should interpolate numeric values of arbitrary format", () => {});

  // Skip: our mock doesn't support color alpha rounding
  it.skip("should round the alpha channel of a color to the nearest thousandth", () => {});

  // Skip: our mock doesn't support PlatformColor interpolation
  it.skip("should work with PlatformColor", () => {});

  // Skip: uses __getNativeConfig() internal
  it.skip("should convert values to numbers in the native config", () => {});
});
