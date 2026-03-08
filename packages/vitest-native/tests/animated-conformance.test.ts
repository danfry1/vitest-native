/**
 * Animated conformance tests — ported from React Native's test suite.
 *
 * Sources:
 * - Libraries/Animated/__tests__/AnimatedMock-test.js (key parity)
 * - Libraries/Animated/__tests__/Animated-test.js (behavioral patterns)
 * - Libraries/Animated/__tests__/AnimatedValue-test.js (Value class)
 * - Libraries/Animated/__tests__/Interpolation-test.js (interpolation)
 */

import { describe, it, expect, vi } from "vitest";
import { Animated } from "react-native";

// ---------------------------------------------------------------------------
// AnimatedMock key parity — from AnimatedMock-test.js
// ---------------------------------------------------------------------------

describe("Animated mock structure (conformance)", () => {
  const expectedKeys = [
    // Classes
    "Value",
    "ValueXY",
    "Color",
    // Animation drivers
    "timing",
    "spring",
    "decay",
    // Compositions
    "sequence",
    "parallel",
    "stagger",
    "loop",
    "delay",
    // Arithmetic
    "add",
    "subtract",
    "multiply",
    "divide",
    "modulo",
    "diffClamp",
    // Events
    "event",
    "forkEvent",
    "unforkEvent",
    // Factory
    "createAnimatedComponent",
    // Pre-built animated components
    "View",
    "Text",
    "Image",
    "ScrollView",
    "FlatList",
    "SectionList",
  ];

  for (const key of expectedKeys) {
    it(`has ${key}`, () => {
      expect(Animated).toHaveProperty(key);
    });
  }

  it("Value is a constructor", () => {
    expect(new Animated.Value(0)).toBeInstanceOf(Animated.Value);
  });

  it("ValueXY is a constructor", () => {
    expect(new Animated.ValueXY()).toBeInstanceOf(Animated.ValueXY);
  });

  it("Color is a constructor", () => {
    expect(new Animated.Color()).toBeInstanceOf(Animated.Color);
  });

  it("animation drivers are functions", () => {
    expect(typeof Animated.timing).toBe("function");
    expect(typeof Animated.spring).toBe("function");
    expect(typeof Animated.decay).toBe("function");
  });

  it("compositions are functions", () => {
    expect(typeof Animated.sequence).toBe("function");
    expect(typeof Animated.parallel).toBe("function");
    expect(typeof Animated.stagger).toBe("function");
    expect(typeof Animated.loop).toBe("function");
    expect(typeof Animated.delay).toBe("function");
  });

  it("arithmetic operators are functions", () => {
    expect(typeof Animated.add).toBe("function");
    expect(typeof Animated.subtract).toBe("function");
    expect(typeof Animated.multiply).toBe("function");
    expect(typeof Animated.divide).toBe("function");
    expect(typeof Animated.modulo).toBe("function");
    expect(typeof Animated.diffClamp).toBe("function");
  });

  it("createAnimatedComponent is a function", () => {
    expect(typeof Animated.createAnimatedComponent).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// AnimatedValue — from AnimatedValue-test.js patterns
// ---------------------------------------------------------------------------

describe("Animated.Value (conformance)", () => {
  it("stores initial value", () => {
    expect(new Animated.Value(42).getValue()).toBe(42);
  });

  it("defaults to 0", () => {
    expect(new Animated.Value(0).getValue()).toBe(0);
  });

  it("setValue updates the value", () => {
    const val = new Animated.Value(0);
    val.setValue(100);
    expect(val.getValue()).toBe(100);
  });

  it("addListener fires on setValue", () => {
    const val = new Animated.Value(0);
    const listener = vi.fn();
    val.addListener(listener);
    val.setValue(50);
    expect(listener).toHaveBeenCalledWith({ value: 50 });
  });

  it("addListener returns an ID string", () => {
    const val = new Animated.Value(0);
    const id = val.addListener(vi.fn());
    expect(typeof id).toBe("string");
  });

  it("removeListener stops notifications", () => {
    const val = new Animated.Value(0);
    const listener = vi.fn();
    const id = val.addListener(listener);
    val.removeListener(id);
    val.setValue(50);
    expect(listener).not.toHaveBeenCalled();
  });

  it("removeAllListeners stops all notifications", () => {
    const val = new Animated.Value(0);
    const l1 = vi.fn();
    const l2 = vi.fn();
    val.addListener(l1);
    val.addListener(l2);
    val.removeAllListeners();
    val.setValue(50);
    expect(l1).not.toHaveBeenCalled();
    expect(l2).not.toHaveBeenCalled();
  });

  it("stopAnimation calls callback with current value", () => {
    const val = new Animated.Value(42);
    const cb = vi.fn();
    val.stopAnimation(cb);
    expect(cb).toHaveBeenCalledWith(42);
  });

  it("resetAnimation calls callback with current value", () => {
    const val = new Animated.Value(7);
    const cb = vi.fn();
    val.resetAnimation(cb);
    expect(cb).toHaveBeenCalledWith(7);
  });

  it("setOffset/flattenOffset/extractOffset are callable", () => {
    const val = new Animated.Value(0);
    expect(() => val.setOffset(10)).not.toThrow();
    expect(() => val.flattenOffset()).not.toThrow();
    expect(() => val.extractOffset()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Animated.ValueXY — basic conformance
// ---------------------------------------------------------------------------

describe("Animated.ValueXY (conformance)", () => {
  it("stores initial x and y", () => {
    const val = new Animated.ValueXY({ x: 10, y: 20 });
    expect(val.x.getValue()).toBe(10);
    expect(val.y.getValue()).toBe(20);
  });

  it("defaults to {x: 0, y: 0}", () => {
    const val = new Animated.ValueXY();
    expect(val.x.getValue()).toBe(0);
    expect(val.y.getValue()).toBe(0);
  });

  it("setValue updates both", () => {
    const val = new Animated.ValueXY();
    val.setValue({ x: 5, y: 10 });
    expect(val.x.getValue()).toBe(5);
    expect(val.y.getValue()).toBe(10);
  });

  it("getLayout returns {left, top}", () => {
    const val = new Animated.ValueXY({ x: 1, y: 2 });
    const layout = val.getLayout();
    expect(layout).toHaveProperty("left");
    expect(layout).toHaveProperty("top");
  });

  it("getTranslateTransform returns transforms array", () => {
    const val = new Animated.ValueXY({ x: 1, y: 2 });
    const transforms = val.getTranslateTransform();
    expect(Array.isArray(transforms)).toBe(true);
    expect(transforms).toHaveLength(2);
    expect(transforms[0]).toHaveProperty("translateX");
    expect(transforms[1]).toHaveProperty("translateY");
  });

  it("stopAnimation calls callback with {x, y}", () => {
    const val = new Animated.ValueXY({ x: 3, y: 4 });
    const cb = vi.fn();
    val.stopAnimation(cb);
    expect(cb).toHaveBeenCalledWith({ x: 3, y: 4 });
  });
});

// ---------------------------------------------------------------------------
// Animation drivers — from Animated-test.js patterns
// ---------------------------------------------------------------------------

describe("Animation drivers (conformance)", () => {
  it("timing returns animation with start/stop/reset", () => {
    const val = new Animated.Value(0);
    const anim = Animated.timing(val, { toValue: 1, duration: 300 });
    expect(typeof anim.start).toBe("function");
    expect(typeof anim.stop).toBe("function");
    expect(typeof anim.reset).toBe("function");
  });

  it("spring returns animation with start/stop/reset", () => {
    const val = new Animated.Value(0);
    const anim = Animated.spring(val, { toValue: 1 });
    expect(typeof anim.start).toBe("function");
    expect(typeof anim.stop).toBe("function");
    expect(typeof anim.reset).toBe("function");
  });

  it("decay returns animation with start/stop/reset", () => {
    const val = new Animated.Value(0);
    const anim = Animated.decay(val, { velocity: 1 });
    expect(typeof anim.start).toBe("function");
    expect(typeof anim.stop).toBe("function");
    expect(typeof anim.reset).toBe("function");
  });

  it("timing.start calls callback with {finished: true}", () => {
    const val = new Animated.Value(0);
    const cb = vi.fn();
    Animated.timing(val, { toValue: 1, duration: 300 }).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it("spring.start calls callback with {finished: true}", () => {
    const val = new Animated.Value(0);
    const cb = vi.fn();
    Animated.spring(val, { toValue: 1 }).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it("sequence returns animation with start/stop/reset", () => {
    const anim = Animated.sequence([
      Animated.timing(new Animated.Value(0), { toValue: 1, duration: 100 }),
    ]);
    expect(typeof anim.start).toBe("function");
    expect(typeof anim.stop).toBe("function");
  });

  it("parallel returns animation with start/stop/reset", () => {
    const anim = Animated.parallel([
      Animated.timing(new Animated.Value(0), { toValue: 1, duration: 100 }),
    ]);
    expect(typeof anim.start).toBe("function");
    expect(typeof anim.stop).toBe("function");
  });

  it("loop returns animation with start/stop/reset", () => {
    const anim = Animated.loop(
      Animated.timing(new Animated.Value(0), { toValue: 1, duration: 100 }),
    );
    expect(typeof anim.start).toBe("function");
    expect(typeof anim.stop).toBe("function");
  });

  it("stagger returns animation with start/stop/reset", () => {
    const anim = Animated.stagger(50, [
      Animated.timing(new Animated.Value(0), { toValue: 1, duration: 100 }),
    ]);
    expect(typeof anim.start).toBe("function");
    expect(typeof anim.stop).toBe("function");
  });

  it("delay returns animation with start/stop/reset", () => {
    const anim = Animated.delay(100);
    expect(typeof anim.start).toBe("function");
    expect(typeof anim.stop).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Arithmetic — basic correctness
// ---------------------------------------------------------------------------

describe("Animated arithmetic (conformance)", () => {
  it("add returns AnimatedValue with sum", () => {
    const a = new Animated.Value(3);
    const b = new Animated.Value(4);
    const result = Animated.add(a, b);
    expect(result.getValue()).toBe(7);
  });

  it("subtract returns AnimatedValue with difference", () => {
    const a = new Animated.Value(10);
    const b = new Animated.Value(3);
    const result = Animated.subtract(a, b);
    expect(result.getValue()).toBe(7);
  });

  it("multiply returns AnimatedValue with product", () => {
    const a = new Animated.Value(3);
    const b = new Animated.Value(4);
    const result = Animated.multiply(a, b);
    expect(result.getValue()).toBe(12);
  });

  it("divide returns AnimatedValue with quotient", () => {
    const a = new Animated.Value(10);
    const b = new Animated.Value(2);
    const result = Animated.divide(a, b);
    expect(result.getValue()).toBe(5);
  });

  it("divide by zero returns 0", () => {
    const a = new Animated.Value(10);
    const b = new Animated.Value(0);
    const result = Animated.divide(a, b);
    expect(result.getValue()).toBe(0);
  });

  it("modulo returns AnimatedValue with remainder", () => {
    const a = new Animated.Value(10);
    const result = Animated.modulo(a, 3);
    expect(result.getValue()).toBe(1);
  });

  it("diffClamp clamps to range", () => {
    const a = new Animated.Value(50);
    const result = Animated.diffClamp(a, 0, 100);
    expect(result.getValue()).toBe(50);
  });

  it("diffClamp clamps below min", () => {
    const a = new Animated.Value(-10);
    const result = Animated.diffClamp(a, 0, 100);
    expect(result.getValue()).toBe(0);
  });

  it("diffClamp clamps above max", () => {
    const a = new Animated.Value(200);
    const result = Animated.diffClamp(a, 0, 100);
    expect(result.getValue()).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Interpolation — from Interpolation-test.js patterns
// ---------------------------------------------------------------------------

describe("Animated.Value interpolation (conformance)", () => {
  it("maps input to output range", () => {
    const val = new Animated.Value(0.5);
    const interp = val.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    });
    expect(interp.getValue()).toBe(50);
  });

  it("clamps to input range", () => {
    const val = new Animated.Value(2);
    const interp = val.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    });
    // Clamped to input max (1) → output 100
    expect(interp.getValue()).toBe(100);
  });

  it("clamps below input range", () => {
    const val = new Animated.Value(-1);
    const interp = val.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    });
    // Clamped to input min (0) → output 0
    expect(interp.getValue()).toBe(0);
  });

  it("works with multiple segments", () => {
    const val = new Animated.Value(1.5);
    const interp = val.interpolate({
      inputRange: [0, 1, 2],
      outputRange: [0, 50, 100],
    });
    expect(interp.getValue()).toBe(75);
  });

  it("returns AnimatedValue instance", () => {
    const val = new Animated.Value(0);
    const interp = val.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
    expect(typeof interp.getValue).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Animated event — basic conformance
// ---------------------------------------------------------------------------

describe("Animated.event (conformance)", () => {
  it("returns a function", () => {
    const val = new Animated.Value(0);
    const handler = Animated.event(
      [{ nativeEvent: { contentOffset: { y: val } } }],
      { useNativeDriver: false },
    );
    expect(typeof handler).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Animated components — from AnimatedMock-test.js
// ---------------------------------------------------------------------------

describe("Animated components (conformance)", () => {
  it("View is a component", () => {
    expect(Animated.View).toBeTruthy();
  });

  it("Text is a component", () => {
    expect(Animated.Text).toBeTruthy();
  });

  it("Image is a component", () => {
    expect(Animated.Image).toBeTruthy();
  });

  it("ScrollView is a component", () => {
    expect(Animated.ScrollView).toBeTruthy();
  });

  it("FlatList is a component", () => {
    expect(Animated.FlatList).toBeTruthy();
  });

  it("SectionList is a component", () => {
    expect(Animated.SectionList).toBeTruthy();
  });

  it("createAnimatedComponent wraps a component", () => {
    const Comp = () => null;
    Comp.displayName = "TestComp";
    const AnimComp = Animated.createAnimatedComponent(Comp);
    expect(AnimComp).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Animated timing/spring sets value — from Animated-test.js patterns
//
// In real RN (and its mock), animations synchronously set the value to
// toValue when start() is called. This is critical for test assertions like:
//   Animated.timing(val, {toValue: 1}).start();
//   expect(val.getValue()).toBe(1);
// ---------------------------------------------------------------------------

describe("Animation drivers set value (conformance)", () => {
  it("timing sets value to toValue on start", () => {
    const val = new Animated.Value(0);
    Animated.timing(val, { toValue: 42, duration: 300 }).start();
    expect(val.getValue()).toBe(42);
  });

  it("spring sets value to toValue on start", () => {
    const val = new Animated.Value(0);
    Animated.spring(val, { toValue: 100 }).start();
    expect(val.getValue()).toBe(100);
  });

  it("timing fires listeners when setting value", () => {
    const val = new Animated.Value(0);
    const listener = vi.fn();
    val.addListener(listener);
    Animated.timing(val, { toValue: 5, duration: 100 }).start();
    expect(listener).toHaveBeenCalledWith({ value: 5 });
  });

  it("spring fires listeners when setting value", () => {
    const val = new Animated.Value(0);
    const listener = vi.fn();
    val.addListener(listener);
    Animated.spring(val, { toValue: 10 }).start();
    expect(listener).toHaveBeenCalledWith({ value: 10 });
  });
});

// ---------------------------------------------------------------------------
// Stop behavior — from Animated-test.js
// ---------------------------------------------------------------------------

describe("Animation stop behavior (conformance)", () => {
  it("stop calls callback with {finished: false}", () => {
    const val = new Animated.Value(0);
    const anim = Animated.timing(val, { toValue: 1, duration: 300 });
    const cb = vi.fn();
    anim.stop(cb);
    expect(cb).toHaveBeenCalledWith({ finished: false });
  });

  it("decay stop calls callback with {finished: false}", () => {
    const val = new Animated.Value(0);
    const anim = Animated.decay(val, { velocity: 1 });
    const cb = vi.fn();
    anim.stop(cb);
    expect(cb).toHaveBeenCalledWith({ finished: false });
  });
});

// ---------------------------------------------------------------------------
// Sequence / parallel edge cases — from Animated-test.js
// ---------------------------------------------------------------------------

describe("Sequence/parallel edge cases (conformance)", () => {
  it("sequence with empty array completes with {finished: true}", () => {
    const cb = vi.fn();
    Animated.sequence([]).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it("parallel with empty array completes with {finished: true}", () => {
    const cb = vi.fn();
    Animated.parallel([]).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it("sequence chains animations and completes", () => {
    const val = new Animated.Value(0);
    const cb = vi.fn();
    Animated.sequence([
      Animated.timing(val, { toValue: 1, duration: 100 }),
      Animated.timing(val, { toValue: 2, duration: 100 }),
    ]).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it("parallel runs animations and completes", () => {
    const v1 = new Animated.Value(0);
    const v2 = new Animated.Value(0);
    const cb = vi.fn();
    Animated.parallel([
      Animated.timing(v1, { toValue: 1, duration: 100 }),
      Animated.timing(v2, { toValue: 2, duration: 100 }),
    ]).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it("stagger completes", () => {
    const val = new Animated.Value(0);
    const cb = vi.fn();
    Animated.stagger(50, [
      Animated.timing(val, { toValue: 1, duration: 100 }),
    ]).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it("loop completes", () => {
    const val = new Animated.Value(0);
    const cb = vi.fn();
    Animated.loop(
      Animated.timing(val, { toValue: 1, duration: 100 }),
    ).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it("delay completes", () => {
    const cb = vi.fn();
    Animated.delay(100).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });
});

// ---------------------------------------------------------------------------
// Animated.Value offset behavior — from AnimatedValue-test.js
// ---------------------------------------------------------------------------

describe("Animated.Value offset (conformance)", () => {
  it("setOffset does not throw", () => {
    const val = new Animated.Value(10);
    expect(() => val.setOffset(5)).not.toThrow();
  });

  it("flattenOffset does not throw", () => {
    const val = new Animated.Value(10);
    val.setOffset(5);
    expect(() => val.flattenOffset()).not.toThrow();
  });

  it("extractOffset does not throw", () => {
    const val = new Animated.Value(10);
    expect(() => val.extractOffset()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Animated.ValueXY additional — from Animated-test.js Vectors section
// ---------------------------------------------------------------------------

describe("Animated.ValueXY additional (conformance)", () => {
  it("resetAnimation calls callback with {x, y}", () => {
    const val = new Animated.ValueXY({ x: 5, y: 10 });
    const cb = vi.fn();
    val.resetAnimation(cb);
    expect(cb).toHaveBeenCalledWith({ x: 5, y: 10 });
  });

  it("setOffset does not throw", () => {
    const val = new Animated.ValueXY();
    expect(() => val.setOffset({ x: 1, y: 2 })).not.toThrow();
  });

  it("flattenOffset does not throw", () => {
    const val = new Animated.ValueXY();
    expect(() => val.flattenOffset()).not.toThrow();
  });

  it("extractOffset does not throw", () => {
    const val = new Animated.ValueXY();
    expect(() => val.extractOffset()).not.toThrow();
  });

  it("addListener returns an object", () => {
    const val = new Animated.ValueXY();
    const result = val.addListener(vi.fn());
    expect(result).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Animated.event value mapping — from Animated-test.js Events section
//
// Animated.event maps event data to Animated.Values. When the handler
// is called with event args, it traverses the mapping and sets values.
// ---------------------------------------------------------------------------

describe("Animated.event value mapping (conformance)", () => {
  it("maps event data to Animated.Value", () => {
    const val = new Animated.Value(0);
    const handler = Animated.event(
      [{ nativeEvent: { contentOffset: { y: val } } }],
      { useNativeDriver: false },
    );
    handler({ nativeEvent: { contentOffset: { y: 42 } } });
    expect(val.getValue()).toBe(42);
  });

  it("maps multiple values from same event", () => {
    const x = new Animated.Value(0);
    const y = new Animated.Value(0);
    const handler = Animated.event(
      [{ nativeEvent: { contentOffset: { x, y } } }],
      { useNativeDriver: false },
    );
    handler({ nativeEvent: { contentOffset: { x: 10, y: 20 } } });
    expect(x.getValue()).toBe(10);
    expect(y.getValue()).toBe(20);
  });

  it("calls listener if provided", () => {
    const val = new Animated.Value(0);
    const listener = vi.fn();
    const handler = Animated.event(
      [{ nativeEvent: { contentOffset: { y: val } } }],
      { useNativeDriver: false, listener },
    );
    const event = { nativeEvent: { contentOffset: { y: 50 } } };
    handler(event);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it("fires value listeners on mapping", () => {
    const val = new Animated.Value(0);
    const valListener = vi.fn();
    val.addListener(valListener);
    const handler = Animated.event(
      [{ nativeEvent: { contentOffset: { y: val } } }],
      { useNativeDriver: false },
    );
    handler({ nativeEvent: { contentOffset: { y: 99 } } });
    expect(valListener).toHaveBeenCalledWith({ value: 99 });
  });
});

// ---------------------------------------------------------------------------
// Interpolation edge cases — from Interpolation-test.js
// ---------------------------------------------------------------------------

describe("Animated interpolation edge cases (conformance)", () => {
  it("works with defaults (identity mapping)", () => {
    const val = new Animated.Value(0.5);
    const interp = val.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
    expect(interp.getValue()).toBe(0.5);
  });

  it("works with output range", () => {
    const val = new Animated.Value(1);
    const interp = val.interpolate({
      inputRange: [0, 1],
      outputRange: [100, 200],
    });
    expect(interp.getValue()).toBe(200);
  });

  it("works with input range offset", () => {
    const val = new Animated.Value(150);
    const interp = val.interpolate({
      inputRange: [100, 200],
      outputRange: [0, 1],
    });
    expect(interp.getValue()).toBe(0.5);
  });

  it("clamps above input range", () => {
    const val = new Animated.Value(2);
    const interp = val.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    });
    // Default clamping: clamp to input max → output max
    expect(interp.getValue()).toBe(100);
  });

  it("clamps below input range", () => {
    const val = new Animated.Value(-1);
    const interp = val.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    });
    expect(interp.getValue()).toBe(0);
  });

  it("works with multiple segments", () => {
    const val = new Animated.Value(1.5);
    const interp = val.interpolate({
      inputRange: [0, 1, 2],
      outputRange: [0, 50, 100],
    });
    expect(interp.getValue()).toBe(75);
  });

  it("works with negative output range", () => {
    const val = new Animated.Value(0.5);
    const interp = val.interpolate({
      inputRange: [0, 1],
      outputRange: [-100, 100],
    });
    expect(interp.getValue()).toBe(0);
  });

  it("works with reversed output range", () => {
    const val = new Animated.Value(0.5);
    const interp = val.interpolate({
      inputRange: [0, 1],
      outputRange: [100, 0],
    });
    expect(interp.getValue()).toBe(50);
  });

  it("handles collapsed input range (equal endpoints)", () => {
    const val = new Animated.Value(5);
    const interp = val.interpolate({
      inputRange: [0, 10, 10],
      outputRange: [0, 100, 200],
    });
    // Value 5 is in segment [0, 10] → output = 50
    expect(interp.getValue()).toBe(50);
  });

  it("handles keyframes with 4+ segments", () => {
    const val = new Animated.Value(3);
    const interp = val.interpolate({
      inputRange: [0, 1, 2, 3, 4],
      outputRange: [0, 25, 50, 75, 100],
    });
    expect(interp.getValue()).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Animated.Color — basic conformance
// ---------------------------------------------------------------------------

describe("Animated.Color (conformance)", () => {
  it("is a constructor", () => {
    expect(new Animated.Color()).toBeInstanceOf(Animated.Color);
  });

  it("has r, g, b, a channels", () => {
    const color = new Animated.Color();
    expect(color.r).toBeDefined();
    expect(color.g).toBeDefined();
    expect(color.b).toBeDefined();
    expect(color.a).toBeDefined();
  });

  it("stopAnimation is callable", () => {
    const color = new Animated.Color();
    const cb = vi.fn();
    color.stopAnimation(cb);
    expect(cb).toHaveBeenCalled();
  });

  it("resetAnimation is callable", () => {
    const color = new Animated.Color();
    const cb = vi.fn();
    color.resetAnimation(cb);
    expect(cb).toHaveBeenCalled();
  });

  it("setValue is callable", () => {
    const color = new Animated.Color();
    expect(() => color.setValue("red")).not.toThrow();
  });

  it("setOffset is callable", () => {
    const color = new Animated.Color();
    expect(() => color.setOffset({})).not.toThrow();
  });

  it("flattenOffset is callable", () => {
    const color = new Animated.Color();
    expect(() => color.flattenOffset()).not.toThrow();
  });
});
