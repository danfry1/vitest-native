/**
 * The Animated node graph: live derived nodes, offsets, and subscribing
 * wrappers — the behaviors real RN has and the old snapshot mock lacked.
 * Rendering behavior is additionally gated against real RN by the crosscheck
 * probes (animated-setvalue-updates-rendered-style and friends).
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { act, render, screen } from "@testing-library/react-native";
import { Animated, useAnimatedValue } from "react-native";

describe("live derived nodes", () => {
  it("numeric interpolations recompute from the source on every read", () => {
    const v = new Animated.Value(0);
    const interp = v.interpolate({ inputRange: [0, 1], outputRange: [10, 20] });
    expect(interp.__getValue()).toBe(10);
    v.setValue(0.5);
    expect(interp.__getValue()).toBe(15);
    v.setValue(1);
    expect(interp.__getValue()).toBe(20);
  });

  it("string interpolations stay live too", () => {
    const v = new Animated.Value(0);
    const deg = v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
    expect(deg.__getValue()).toBe("0deg");
    v.setValue(0.5);
    expect(deg.__getValue()).toBe("180deg");
  });

  it("numeric interpolations chain (RN allows interpolate().interpolate())", () => {
    const v = new Animated.Value(0);
    const chained = v
      .interpolate({ inputRange: [0, 1], outputRange: [0, 10] })
      .interpolate({ inputRange: [0, 10], outputRange: [100, 200] });
    expect(chained.__getValue()).toBe(100);
    v.setValue(1);
    expect(chained.__getValue()).toBe(200);
  });

  it("chaining off a string interpolation still throws (RN parity)", () => {
    const v = new Animated.Value(0);
    const s = v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] });
    expect(() => s.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })).toThrow(
      /string-valued interpolation/,
    );
  });

  it("arithmetic ops are live and accept derived nodes as operands", () => {
    const a = new Animated.Value(2);
    const b = new Animated.Value(3);
    const sum = Animated.add(a, b);
    expect(sum.__getValue()).toBe(5);
    a.setValue(10);
    expect(sum.__getValue()).toBe(13);

    // An interpolation as an operand (previously coerced to 0).
    const scaled = Animated.multiply(
      a.interpolate({ inputRange: [0, 10], outputRange: [0, 1] }),
      b,
    );
    expect(scaled.__getValue()).toBe(3);
    b.setValue(4);
    expect(scaled.__getValue()).toBe(4);
  });

  it("value listeners fire through derived nodes", () => {
    const v = new Animated.Value(0);
    const interp = v.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });
    const seen: number[] = [];
    interp.addListener(({ value }: { value: number }) => seen.push(value));
    v.setValue(0.25);
    v.setValue(0.5);
    expect(seen).toEqual([25, 50]);
  });
});

describe("offsets (the PanResponder drag pattern)", () => {
  it("setOffset adds on read; flattenOffset folds; extractOffset moves", () => {
    const v = new Animated.Value(10);
    v.setOffset(5);
    expect(v.__getValue()).toBe(15);
    v.flattenOffset();
    expect(v.__getValue()).toBe(15); // observable value unchanged
    v.setValue(0);
    v.setOffset(3);
    v.extractOffset();
    expect(v.__getValue()).toBe(3); // value moved into offset
    v.setValue(4); // fresh gesture delta on top of the offset
    expect(v.__getValue()).toBe(7);
  });

  it("ValueXY delegates offsets and reports joint listener values", () => {
    const xy = new Animated.ValueXY({ x: 1, y: 2 });
    xy.setOffset({ x: 10, y: 20 });
    expect(xy.getValue()).toEqual({ x: 11, y: 22 });

    const seen: Array<{ x: number; y: number }> = [];
    xy.addListener((v: { x: number; y: number }) => seen.push(v));
    xy.setValue({ x: 5, y: 6 });
    // One notification per axis write, each carrying the full current pair.
    expect(seen.at(-1)).toEqual({ x: 15, y: 26 });
  });
});

describe("subscribing wrappers", () => {
  it("re-renders the host style when a value moves after render", async () => {
    const opacity = new Animated.Value(0.3);
    await render(<Animated.View testID="live" style={{ opacity }} />);
    expect(screen.getByTestId("live")).toHaveStyle({ opacity: 0.3 });
    await act(async () => opacity.setValue(0.9));
    expect(screen.getByTestId("live")).toHaveStyle({ opacity: 0.9 });
  });

  it("timing().start() drives the rendered style through tracking", async () => {
    const opacity = new Animated.Value(0);
    await render(<Animated.View testID="anim" style={{ opacity }} />);
    await act(async () => {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    });
    expect(screen.getByTestId("anim")).toHaveStyle({ opacity: 1 });
  });

  it("unsubscribes on unmount (no listener leak, no post-unmount updates)", async () => {
    const v = new Animated.Value(0);
    const { unmount } = await render(<Animated.View testID="u" style={{ opacity: v }} />);
    await act(async () => unmount());
    // A post-unmount setValue must not throw or warn about updates on
    // unmounted components — the subscription was removed with the effect.
    expect(() => v.setValue(1)).not.toThrow();
  });
});

describe("useAnimatedValue is a real hook", () => {
  it("returns the SAME node across re-renders", async () => {
    const seen: unknown[] = [];
    function Probe({ tick }: { tick: number }) {
      const v = useAnimatedValue(0.5);
      seen.push(v);
      return <Animated.View testID={`t-${tick}`} style={{ opacity: v }} />;
    }
    const { rerender } = await render(<Probe tick={1} />);
    await act(async () => rerender(<Probe tick={2} />));
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it("preserves animation state across re-renders", async () => {
    let captured: any;
    function Probe({ tick }: { tick: number }) {
      const v = useAnimatedValue(0);
      captured = v;
      return <Animated.View testID={`p-${tick}`} style={{ opacity: v }} />;
    }
    const { rerender } = await render(<Probe tick={1} />);
    await act(async () => captured.setValue(0.7));
    await act(async () => rerender(<Probe tick={2} />));
    // The value survives the re-render (previously a fresh node reset it).
    expect(captured.getValue()).toBe(0.7);
    expect(screen.getByTestId("p-2")).toHaveStyle({ opacity: 0.7 });
  });
});

describe("regression: existing shapes preserved", () => {
  it("__getValue exists on plain values (RN's own tests call it)", () => {
    const v = new Animated.Value(0.25);
    expect(v.__getValue()).toBe(0.25);
    expect(v.getValue()).toBe(0.25);
  });

  it("Animated.event still maps native events into values", () => {
    const x = new Animated.Value(0);
    const handler = Animated.event([{ nativeEvent: { contentOffset: { x } } }], {
      useNativeDriver: false,
    });
    handler({ nativeEvent: { contentOffset: { x: 55 } } });
    expect(x.getValue()).toBe(55);
  });

  it("diffClamp accumulates deltas within bounds and notifies", () => {
    const v = new Animated.Value(0);
    const clamped = Animated.diffClamp(v, 0, 20);
    const seen: number[] = [];
    clamped.addListener(({ value }: { value: number }) => seen.push(value));
    v.setValue(30); // +30 clamps to 20
    v.setValue(25); // -5 → 15
    expect(clamped.__getValue()).toBe(15);
    expect(seen).toEqual([20, 15]);
  });

  it("divide by zero keeps the historical mock behavior (0, not Infinity)", () => {
    const q = Animated.divide(new Animated.Value(4), new Animated.Value(0));
    expect(q.__getValue()).toBe(0);
  });
});
