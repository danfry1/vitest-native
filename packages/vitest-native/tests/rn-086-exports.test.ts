/**
 * Regression coverage for top-level exports introduced in react-native 0.86.
 *
 * The weekly compatibility check (scripts/check-compat.ts) flagged these as new
 * stable exports. They are mocked so suites running against RN 0.86+ resolve the
 * named imports instead of failing with "does not provide an export named …".
 */

import { describe, it, expect } from "vitest";
import { Animated, EventEmitter, useAnimatedColor, useAnimatedValueXY } from "react-native";

describe("useAnimatedValueXY (RN 0.86)", () => {
  it("returns an Animated.ValueXY", () => {
    const value = useAnimatedValueXY({ x: 10, y: 20 });
    expect(value).toBeInstanceOf(Animated.ValueXY);
    expect(value.x.getValue()).toBe(10);
    expect(value.y.getValue()).toBe(20);
  });

  it("defaults to the origin", () => {
    const value = useAnimatedValueXY();
    expect(value.x.getValue()).toBe(0);
    expect(value.y.getValue()).toBe(0);
  });
});

describe("useAnimatedColor (RN 0.86)", () => {
  it("returns an Animated.Color parsed from a string", () => {
    const color = useAnimatedColor("rgba(255, 0, 0, 1)");
    expect(color).toBeInstanceOf(Animated.Color);
    expect(color.r.getValue()).toBe(255);
    expect(color.g.getValue()).toBe(0);
    expect(color.b.getValue()).toBe(0);
    expect(color.a.getValue()).toBe(1);
  });
});

describe("EventEmitter (RN 0.86)", () => {
  it("dispatches emitted events to listeners", () => {
    const emitter = new EventEmitter();
    let received: unknown;
    emitter.addListener("ping", (payload: unknown) => {
      received = payload;
    });
    emitter.emit("ping", 42);
    expect(received).toBe(42);
  });

  it("stops dispatching after a subscription is removed", () => {
    const emitter = new EventEmitter();
    let count = 0;
    const subscription = emitter.addListener("tick", () => {
      count += 1;
    });
    emitter.emit("tick");
    subscription.remove();
    emitter.emit("tick");
    expect(count).toBe(1);
  });
});
