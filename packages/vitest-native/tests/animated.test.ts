import { describe, it, expect, vi } from "vitest";
import { Animated } from "react-native";

describe("Animated", () => {
  it("creates a Value", () => {
    const val = new Animated.Value(42);
    expect(val.getValue()).toBe(42);
  });

  it("sets and gets value", () => {
    const val = new Animated.Value(0);
    val.setValue(100);
    expect(val.getValue()).toBe(100);
  });

  it("runs timing animation", () => {
    const val = new Animated.Value(0);
    const callback = vi.fn();
    Animated.timing(val, { toValue: 1, duration: 300 }).start(callback);
    expect(callback).toHaveBeenCalledWith({ finished: true });
  });

  it("runs spring animation", () => {
    const val = new Animated.Value(0);
    const callback = vi.fn();
    Animated.spring(val, { toValue: 1 }).start(callback);
    expect(callback).toHaveBeenCalledWith({ finished: true });
  });

  it("creates ValueXY", () => {
    const val = new Animated.ValueXY({ x: 10, y: 20 });
    expect(val.x.getValue()).toBe(10);
    expect(val.y.getValue()).toBe(20);
  });

  it("supports addListener", () => {
    const val = new Animated.Value(0);
    const listener = vi.fn();
    val.addListener(listener);
    val.setValue(50);
    expect(listener).toHaveBeenCalledWith({ value: 50 });
  });
});
