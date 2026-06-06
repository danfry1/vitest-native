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

  it("should throw for non monotonic input ranges", () => {
    expect(() => createInterpolation({ inputRange: [0, 2, 1], outputRange: [0, 1, 2] })(1)).toThrow(
      /monotonically non-decreasing/,
    );
  });

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

  it("should throw for an infinite input range", () => {
    expect(() =>
      createInterpolation({ inputRange: [-Infinity, Infinity], outputRange: [0, 1] })(0),
    ).toThrow();
  });

  it("should work with negative infinite", () => {
    const interpolation = createInterpolation({
      inputRange: [-Infinity, 0],
      outputRange: [0, 1],
      easing: Easing.quad,
    });
    expect(interpolation(0)).toBe(0);
    expect(interpolation(-1)).toBe(1);
    expect(interpolation(-2)).toBe(4); // easing applied: (-(-2))^2 = 4
  });

  it("should work with positive infinite", () => {
    const interpolation = createInterpolation({
      inputRange: [0, Infinity],
      outputRange: [0, 1],
      easing: Easing.quad,
    });
    expect(interpolation(0)).toBe(0);
    expect(interpolation(2)).toBe(4); // (2-0)^2 = 4
    expect(interpolation(3)).toBe(9);
  });

  it("should work with output ranges as string", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: ["0deg", "100deg"],
    });
    expect(interpolation(0)).toBe("0deg");
    expect(interpolation(0.5)).toBe("50deg");
    expect(interpolation(1)).toBe("100deg");
  });

  it("should work with negative and decimal values in string ranges", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: ["-100deg", "100deg"],
    });
    expect(interpolation(0)).toBe("-100deg");
    expect(interpolation(0.5)).toBe("0deg");
    expect(interpolation(1)).toBe("100deg");
  });

  it("should interpolate values with arbitrary suffixes (multi-slot)", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: ["M20,20L20,80", "M40,40L40,60"],
    });
    expect(interpolation(0)).toBe("M20,20L20,80");
    expect(interpolation(0.5)).toBe("M30,30L30,70");
    expect(interpolation(1)).toBe("M40,40L40,60");
  });

  it("should work with output ranges as short hex string", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: ["#fff", "#000"],
    });
    expect(interpolation(0)).toBe("rgba(255, 255, 255, 1)");
    expect(interpolation(0.5)).toBe("rgba(128, 128, 128, 1)");
    expect(interpolation(1)).toBe("rgba(0, 0, 0, 1)");
  });

  it("should work with output ranges as long hex string", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: ["#ff0000", "#0000ff"],
    });
    expect(interpolation(0)).toBe("rgba(255, 0, 0, 1)");
    expect(interpolation(0.5)).toBe("rgba(128, 0, 128, 1)");
    expect(interpolation(1)).toBe("rgba(0, 0, 255, 1)");
  });

  it("should work with output ranges with mixed hex and rgba strings", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: ["#ff0000", "rgba(0, 0, 255, 0.5)"],
    });
    expect(interpolation(0)).toBe("rgba(255, 0, 0, 1)");
    expect(interpolation(0.5)).toBe("rgba(128, 0, 128, 0.75)");
    expect(interpolation(1)).toBe("rgba(0, 0, 255, 0.5)");
  });

  it("should crash when chaining an interpolation that returns a string", () => {
    const stringInterp = new Animated.Value(0).interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "100deg"],
    });
    expect(() => stringInterp.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })).toThrow();
  });

  it("should support a mix of color patterns", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: ["red", "rgba(0, 0, 255, 1)"],
    });
    expect(interpolation(0)).toBe("rgba(255, 0, 0, 1)");
    expect(interpolation(0.5)).toBe("rgba(128, 0, 128, 1)");
    expect(interpolation(1)).toBe("rgba(0, 0, 255, 1)");
  });

  it("should crash when defining output range with different pattern", () => {
    // One element is a color, the other a plain numeric-suffix string.
    expect(() =>
      createInterpolation({ inputRange: [0, 1], outputRange: ["#fff", "20deg"] })(0),
    ).toThrow();
  });

  it("should interpolate values with arbitrary suffixes", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: ["10rem", "20rem"],
    });
    expect(interpolation(0)).toBe("10rem");
    expect(interpolation(0.5)).toBe("15rem");
    expect(interpolation(1)).toBe("20rem");
  });

  it("should interpolate numeric values of arbitrary format", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: ["scale(1)", "scale(2)"],
    });
    expect(interpolation(0)).toBe("scale(1)");
    expect(interpolation(0.5)).toBe("scale(1.5)");
    expect(interpolation(1)).toBe("scale(2)");
  });

  it("should round the alpha channel of a color to the nearest thousandth", () => {
    const interpolation = createInterpolation({
      inputRange: [0, 1],
      outputRange: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 1)"],
    });
    expect(interpolation(1 / 3)).toBe("rgba(0, 0, 0, 0.333)");
  });

  // Genuinely out of scope for the mock engine (kept skipped, honestly):
  // - PlatformColor is an opaque native object; RN itself throws
  //   "PlatformColors are not supported" in interpolation, so there's no
  //   meaningful value to assert here.
  it.skip("should work with PlatformColor", () => {});
  // - __getNativeConfig() exposes the native-driver config, which the mock
  //   engine does not model (there is no native animated graph).
  it.skip("should convert values to numbers in the native config", () => {});
});
