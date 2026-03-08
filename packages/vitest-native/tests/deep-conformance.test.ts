/**
 * Deep conformance tests — covers mock APIs that had thin or no test coverage.
 *
 * Targets: UIManager, PanResponder, BackHandler, InteractionManager,
 *          Keyboard, Easing edge cases, Clipboard.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  UIManager,
  PanResponder,
  BackHandler,
  InteractionManager,
  Keyboard,
  Easing,
  Clipboard,
} from "react-native";

// ---------------------------------------------------------------------------
// UIManager
// ---------------------------------------------------------------------------

describe("UIManager (conformance)", () => {
  it("measure calls callback with 6 numeric parameters", () => {
    const cb = vi.fn();
    UIManager.measure(1, cb);
    expect(cb).toHaveBeenCalledWith(0, 0, 0, 0, 0, 0);
    expect(cb.mock.calls[0]).toHaveLength(6);
  });

  it("measureInWindow calls callback with 4 parameters", () => {
    const cb = vi.fn();
    UIManager.measureInWindow(1, cb);
    expect(cb).toHaveBeenCalledWith(0, 0, 0, 0);
    expect(cb.mock.calls[0]).toHaveLength(4);
  });

  it("measureLayout calls onSuccess (not onFail)", () => {
    const onFail = vi.fn();
    const onSuccess = vi.fn();
    UIManager.measureLayout(1, 2, onFail, onSuccess);
    expect(onSuccess).toHaveBeenCalledWith(0, 0, 0, 0);
    expect(onFail).not.toHaveBeenCalled();
  });

  it("getViewManagerConfig returns an object", () => {
    const config = UIManager.getViewManagerConfig("RCTView");
    expect(config).toEqual({});
  });

  it("hasViewManagerConfig returns a boolean", () => {
    expect(typeof UIManager.hasViewManagerConfig("RCTView")).toBe("boolean");
  });

  it("setLayoutAnimationEnabledExperimental is callable", () => {
    expect(() =>
      UIManager.setLayoutAnimationEnabledExperimental(true),
    ).not.toThrow();
  });

  it("configureNextLayoutAnimation is callable", () => {
    expect(() =>
      UIManager.configureNextLayoutAnimation({}, () => {}, () => {}),
    ).not.toThrow();
  });

  it("dispatchViewManagerCommand is callable", () => {
    expect(() =>
      UIManager.dispatchViewManagerCommand(1, "focus", []),
    ).not.toThrow();
  });

  it("setChildren, manageChildren, createView, updateView are callable", () => {
    expect(() => UIManager.setChildren(1, [2, 3])).not.toThrow();
    expect(() => UIManager.manageChildren(1, [], [], [], [], [])).not.toThrow();
    expect(() => UIManager.createView(1, "RCTView", 1, {})).not.toThrow();
    expect(() => UIManager.updateView(1, "RCTView", {})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PanResponder
// ---------------------------------------------------------------------------

describe("PanResponder (conformance)", () => {
  it("create returns panHandlers object", () => {
    const pr = PanResponder.create({});
    expect(pr.panHandlers).toBeDefined();
    expect(typeof pr.panHandlers).toBe("object");
  });

  it("panHandlers contains all 12 responder props", () => {
    const pr = PanResponder.create({});
    const expected = [
      "onStartShouldSetResponder",
      "onMoveShouldSetResponder",
      "onStartShouldSetResponderCapture",
      "onMoveShouldSetResponderCapture",
      "onResponderGrant",
      "onResponderReject",
      "onResponderStart",
      "onResponderMove",
      "onResponderEnd",
      "onResponderRelease",
      "onResponderTerminate",
      "onResponderTerminationRequest",
    ];
    for (const key of expected) {
      expect(pr.panHandlers).toHaveProperty(key);
    }
  });

  it("default should-set handlers return false", () => {
    const pr = PanResponder.create({});
    expect(pr.panHandlers.onStartShouldSetResponder()).toBe(false);
    expect(pr.panHandlers.onMoveShouldSetResponder()).toBe(false);
    expect(pr.panHandlers.onStartShouldSetResponderCapture()).toBe(false);
    expect(pr.panHandlers.onMoveShouldSetResponderCapture()).toBe(false);
  });

  it("default terminationRequest returns true", () => {
    const pr = PanResponder.create({});
    expect(pr.panHandlers.onResponderTerminationRequest()).toBe(true);
  });

  it("delegates config handlers through panHandlers", () => {
    const onGrant = vi.fn();
    const onMove = vi.fn();
    const onRelease = vi.fn();
    const pr = PanResponder.create({
      onPanResponderGrant: onGrant,
      onPanResponderMove: onMove,
      onPanResponderRelease: onRelease,
    });
    const event = { nativeEvent: {} };
    pr.panHandlers.onResponderGrant(event);
    pr.panHandlers.onResponderMove(event);
    pr.panHandlers.onResponderRelease(event);
    expect(onGrant).toHaveBeenCalledWith(event);
    expect(onMove).toHaveBeenCalledWith(event);
    expect(onRelease).toHaveBeenCalledWith(event);
  });

  it("onStartShouldSetPanResponder delegates and returns value", () => {
    const pr = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
    });
    expect(pr.panHandlers.onStartShouldSetResponder()).toBe(true);
  });

  it("onMoveShouldSetPanResponder delegates and returns value", () => {
    const pr = PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
    });
    expect(pr.panHandlers.onMoveShouldSetResponder()).toBe(true);
  });

  it("capture handlers delegate correctly", () => {
    const pr = PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
    });
    expect(pr.panHandlers.onStartShouldSetResponderCapture()).toBe(true);
    expect(pr.panHandlers.onMoveShouldSetResponderCapture()).toBe(true);
  });

  it("terminationRequest can be overridden to deny", () => {
    const pr = PanResponder.create({
      onPanResponderTerminationRequest: () => false,
    });
    expect(pr.panHandlers.onResponderTerminationRequest()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BackHandler
// ---------------------------------------------------------------------------

describe("BackHandler (conformance)", () => {
  beforeEach(() => {
    (BackHandler as any)._reset();
  });

  it("addEventListener returns subscription with remove()", () => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    expect(sub).toHaveProperty("remove");
    expect(typeof sub.remove).toBe("function");
  });

  it("_simulateBackPress calls handlers in LIFO order", () => {
    const order: number[] = [];
    BackHandler.addEventListener("hardwareBackPress", () => {
      order.push(1);
      return false;
    });
    BackHandler.addEventListener("hardwareBackPress", () => {
      order.push(2);
      return false;
    });
    BackHandler.addEventListener("hardwareBackPress", () => {
      order.push(3);
      return false;
    });
    (BackHandler as any)._simulateBackPress();
    expect(order).toEqual([3, 2, 1]);
  });

  it("handler returning true stops propagation", () => {
    const order: number[] = [];
    BackHandler.addEventListener("hardwareBackPress", () => {
      order.push(1);
      return false;
    });
    BackHandler.addEventListener("hardwareBackPress", () => {
      order.push(2);
      return true; // consumes the event
    });
    BackHandler.addEventListener("hardwareBackPress", () => {
      order.push(3);
      return false;
    });
    (BackHandler as any)._simulateBackPress();
    // 3 is called first (LIFO), then 2 consumes — 1 is never called
    expect(order).toEqual([3, 2]);
  });

  it("remove() unregisters a handler", () => {
    const order: number[] = [];
    BackHandler.addEventListener("hardwareBackPress", () => {
      order.push(1);
      return false;
    });
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      order.push(2);
      return false;
    });
    sub.remove();
    (BackHandler as any)._simulateBackPress();
    expect(order).toEqual([1]);
  });

  it("_reset clears all listeners", () => {
    const handler = vi.fn();
    BackHandler.addEventListener("hardwareBackPress", handler);
    (BackHandler as any)._reset();
    (BackHandler as any)._simulateBackPress();
    expect(handler).not.toHaveBeenCalled();
  });

  it("exitApp is callable", () => {
    expect(() => BackHandler.exitApp()).not.toThrow();
  });

  it("ignores non-hardwareBackPress events", () => {
    const handler = vi.fn(() => false);
    BackHandler.addEventListener("other", handler);
    (BackHandler as any)._simulateBackPress();
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// InteractionManager
// ---------------------------------------------------------------------------

describe("InteractionManager (conformance)", () => {
  it("runAfterInteractions executes task synchronously", () => {
    const task = vi.fn();
    InteractionManager.runAfterInteractions(task);
    expect(task).toHaveBeenCalledOnce();
  });

  it("runAfterInteractions returns thenable with then/done/cancel", () => {
    const result = InteractionManager.runAfterInteractions(() => {});
    expect(typeof result.then).toBe("function");
    expect(typeof result.done).toBe("function");
    expect(typeof result.cancel).toBe("function");
  });

  it("then() chains correctly", async () => {
    const chainFn = vi.fn(() => 42);
    const result = await InteractionManager.runAfterInteractions(() => {}).then(
      chainFn,
    );
    expect(chainFn).toHaveBeenCalled();
    expect(result).toBe(42);
  });

  it("accepts generator-style task objects", () => {
    const genFn = vi.fn();
    InteractionManager.runAfterInteractions({ gen: genFn } as any);
    expect(genFn).toHaveBeenCalledOnce();
  });

  it("createInteractionHandle returns a number", () => {
    const handle = InteractionManager.createInteractionHandle();
    expect(typeof handle).toBe("number");
  });

  it("clearInteractionHandle is callable", () => {
    const handle = InteractionManager.createInteractionHandle();
    expect(() => InteractionManager.clearInteractionHandle(handle)).not.toThrow();
  });

  it("setDeadline is callable", () => {
    expect(() => InteractionManager.setDeadline(100)).not.toThrow();
  });

  it("runAfterInteractions with no argument does not throw", () => {
    expect(() => InteractionManager.runAfterInteractions()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

describe("Keyboard (conformance)", () => {
  beforeEach(() => {
    (Keyboard as any)._reset();
  });

  it("starts not visible", () => {
    expect(Keyboard.isVisible()).toBe(false);
  });

  it("metrics returns undefined when hidden", () => {
    expect(Keyboard.metrics()).toBeUndefined();
  });

  it("_show makes keyboard visible", () => {
    (Keyboard as any)._show(300);
    expect(Keyboard.isVisible()).toBe(true);
  });

  it("_show triggers keyboardDidShow listener with endCoordinates", () => {
    const handler = vi.fn();
    Keyboard.addListener("keyboardDidShow", handler);
    (Keyboard as any)._show(300);
    expect(handler).toHaveBeenCalledWith({
      endCoordinates: { screenX: 0, screenY: 544, width: 390, height: 300 },
    });
  });

  it("metrics returns correct dimensions when visible", () => {
    (Keyboard as any)._show(300);
    const m = Keyboard.metrics();
    expect(m).toEqual({
      screenX: 0,
      screenY: 544,
      width: 390,
      height: 300,
    });
  });

  it("_hide triggers keyboardDidHide listener", () => {
    const handler = vi.fn();
    Keyboard.addListener("keyboardDidHide", handler);
    (Keyboard as any)._show(300);
    (Keyboard as any)._hide();
    expect(handler).toHaveBeenCalledWith({});
    expect(Keyboard.isVisible()).toBe(false);
  });

  it("dismiss hides the keyboard", () => {
    (Keyboard as any)._show(300);
    Keyboard.dismiss();
    // dismiss sets visible to false
    expect(Keyboard.isVisible()).toBe(false);
  });

  it("multiple listeners on same event all fire", () => {
    const a = vi.fn();
    const b = vi.fn();
    Keyboard.addListener("keyboardDidShow", a);
    Keyboard.addListener("keyboardDidShow", b);
    (Keyboard as any)._show();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("subscription.remove stops that listener only", () => {
    const a = vi.fn();
    const b = vi.fn();
    const subA = Keyboard.addListener("keyboardDidShow", a);
    Keyboard.addListener("keyboardDidShow", b);
    subA.remove();
    (Keyboard as any)._show();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it("removeListener removes specific handler", () => {
    const handler = vi.fn();
    Keyboard.addListener("keyboardDidShow", handler);
    Keyboard.removeListener("keyboardDidShow", handler);
    (Keyboard as any)._show();
    expect(handler).not.toHaveBeenCalled();
  });

  it("removeAllListeners(event) removes only that event", () => {
    const show = vi.fn();
    const hide = vi.fn();
    Keyboard.addListener("keyboardDidShow", show);
    Keyboard.addListener("keyboardDidHide", hide);
    Keyboard.removeAllListeners("keyboardDidShow");
    (Keyboard as any)._show();
    (Keyboard as any)._hide();
    expect(show).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalledOnce();
  });

  it("removeAllListeners() clears everything", () => {
    const show = vi.fn();
    const hide = vi.fn();
    Keyboard.addListener("keyboardDidShow", show);
    Keyboard.addListener("keyboardDidHide", hide);
    Keyboard.removeAllListeners();
    (Keyboard as any)._show();
    (Keyboard as any)._hide();
    expect(show).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("scheduleLayoutAnimation is callable", () => {
    expect(() => Keyboard.scheduleLayoutAnimation({} as any)).not.toThrow();
  });

  it("default _show height is 336", () => {
    (Keyboard as any)._show();
    expect(Keyboard.metrics()).toEqual({
      screenX: 0,
      screenY: 508,
      width: 390,
      height: 336,
    });
  });

  it("_reset restores initial state", () => {
    (Keyboard as any)._show(400);
    const handler = vi.fn();
    Keyboard.addListener("keyboardDidShow", handler);
    (Keyboard as any)._reset();
    expect(Keyboard.isVisible()).toBe(false);
    (Keyboard as any)._show();
    // handler was cleared by _reset, so should not fire
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Easing edge cases (conformance)
// ---------------------------------------------------------------------------

describe("Easing edge cases (conformance)", () => {
  // Boundary values
  it("all basic functions return 0 at t=0", () => {
    expect(Easing.linear(0)).toBe(0);
    expect(Easing.quad(0)).toBe(0);
    expect(Easing.cubic(0)).toBe(0);
    expect(Easing.sin(0)).toBeCloseTo(0);
    expect(Easing.circle(0)).toBeCloseTo(0);
  });

  it("all basic functions return 1 at t=1", () => {
    expect(Easing.linear(1)).toBe(1);
    expect(Easing.quad(1)).toBe(1);
    expect(Easing.cubic(1)).toBe(1);
    expect(Easing.sin(1)).toBeCloseTo(1);
    expect(Easing.circle(1)).toBeCloseTo(1);
  });

  it("ease returns 0 at t=0 and 1 at t=1", () => {
    expect(Easing.ease(0)).toBe(0);
    expect(Easing.ease(1)).toBe(1);
  });

  // Bezier validation
  it("bezier throws for x1 < 0", () => {
    expect(() => Easing.bezier(-0.1, 0, 1, 1)).toThrow();
  });

  it("bezier throws for x1 > 1", () => {
    expect(() => Easing.bezier(1.1, 0, 1, 1)).toThrow();
  });

  it("bezier throws for x2 < 0", () => {
    expect(() => Easing.bezier(0, 0, -0.1, 1)).toThrow();
  });

  it("bezier throws for x2 > 1", () => {
    expect(() => Easing.bezier(0, 0, 1.1, 1)).toThrow();
  });

  it("bezier allows y values outside [0,1]", () => {
    const fn = Easing.bezier(0.5, -1, 0.5, 2);
    expect(typeof fn).toBe("function");
    expect(fn(0)).toBe(0);
    expect(fn(1)).toBe(1);
  });

  it("bezier with linear params returns identity", () => {
    const fn = Easing.bezier(0.25, 0.25, 0.75, 0.75);
    expect(fn(0.5)).toBeCloseTo(0.5);
    expect(fn(0.25)).toBeCloseTo(0.25);
  });

  // poly
  it("poly(1) is linear", () => {
    const fn = Easing.poly(1);
    expect(fn(0.5)).toBe(0.5);
    expect(fn(0.25)).toBe(0.25);
  });

  it("poly(2) matches quad", () => {
    expect(Easing.poly(2)(0.5)).toBe(Easing.quad(0.5));
    expect(Easing.poly(2)(0.3)).toBeCloseTo(Easing.quad(0.3));
  });

  it("poly(3) matches cubic", () => {
    expect(Easing.poly(3)(0.5)).toBe(Easing.cubic(0.5));
  });

  // step functions
  it("step0: 0 at t=0, 1 at t>0", () => {
    expect(Easing.step0(0)).toBe(0);
    expect(Easing.step0(0.0001)).toBe(1);
    expect(Easing.step0(0.5)).toBe(1);
    expect(Easing.step0(1)).toBe(1);
  });

  it("step1: 0 at t<1, 1 at t>=1", () => {
    expect(Easing.step1(0)).toBe(0);
    expect(Easing.step1(0.5)).toBe(0);
    expect(Easing.step1(0.9999)).toBe(0);
    expect(Easing.step1(1)).toBe(1);
  });

  // in / out / inOut modifiers
  it("Easing.in is identity (returns same function)", () => {
    const fn = Easing.quad;
    expect(Easing.in(fn)).toBe(fn);
  });

  it("Easing.out reverses the easing", () => {
    const outQuad = Easing.out(Easing.quad);
    // out(f)(t) = 1 - f(1 - t)
    expect(outQuad(0)).toBeCloseTo(0);
    expect(outQuad(1)).toBeCloseTo(1);
    // at t=0.5: 1 - (0.5)^2 = 0.75
    expect(outQuad(0.5)).toBeCloseTo(0.75);
  });

  it("Easing.inOut splits at midpoint", () => {
    const inOutQuad = Easing.inOut(Easing.quad);
    expect(inOutQuad(0)).toBeCloseTo(0);
    expect(inOutQuad(1)).toBeCloseTo(1);
    // at t=0.5: quad(1)/2 = 0.5
    expect(inOutQuad(0.5)).toBeCloseTo(0.5);
    // at t=0.25: quad(0.5)/2 = 0.125
    expect(inOutQuad(0.25)).toBeCloseTo(0.125);
  });

  // elastic
  it("elastic(1) returns 0 at 0 and ~1 at 1", () => {
    const fn = Easing.elastic(1);
    expect(fn(0)).toBeCloseTo(0);
    expect(fn(1)).toBeCloseTo(1, 1);
  });

  // back
  it("back() overshoots past 0 before reaching 1", () => {
    const fn = Easing.back();
    expect(fn(0)).toBeCloseTo(0);
    expect(fn(1)).toBeCloseTo(1);
    // at small t values, back goes negative
    expect(fn(0.1)).toBeLessThan(0);
  });

  it("back(0) has no overshoot", () => {
    const fn = Easing.back(0);
    // t*t*((0+1)*t - 0) = t^3
    expect(fn(0.5)).toBeCloseTo(0.125);
  });

  // bounce
  it("bounce returns 0 at t=0", () => {
    expect(Easing.bounce(0)).toBe(0);
  });

  it("bounce returns 1 at t=1", () => {
    expect(Easing.bounce(1)).toBeCloseTo(1);
  });

  it("bounce stays in [0,1] range for all t in [0,1]", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const v = Easing.bounce(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  // exp
  it("exp returns very small value at t=0", () => {
    // 2^(10*(0-1)) = 2^-10 ≈ 0.000977
    expect(Easing.exp(0)).toBeCloseTo(0.000977, 4);
  });

  it("exp returns 1 at t=1", () => {
    expect(Easing.exp(1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

describe("Clipboard (conformance)", () => {
  it("getString returns empty string initially", async () => {
    // Reset state by setting to empty
    Clipboard.setString("");
    const result = await Clipboard.getString();
    expect(result).toBe("");
  });

  it("setString + getString round-trips", async () => {
    Clipboard.setString("hello world");
    expect(await Clipboard.getString()).toBe("hello world");
  });

  it("hasString returns false for empty string", async () => {
    Clipboard.setString("");
    expect(await Clipboard.hasString()).toBe(false);
  });

  it("hasString returns true for non-empty string", async () => {
    Clipboard.setString("content");
    expect(await Clipboard.hasString()).toBe(true);
  });

  it("handles unicode content", async () => {
    Clipboard.setString("日本語テスト 🎉");
    expect(await Clipboard.getString()).toBe("日本語テスト 🎉");
    expect(await Clipboard.hasString()).toBe(true);
  });

  it("overwrites previous content", async () => {
    Clipboard.setString("first");
    Clipboard.setString("second");
    expect(await Clipboard.getString()).toBe("second");
  });
});
