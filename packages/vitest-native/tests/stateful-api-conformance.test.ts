/**
 * Stateful API conformance tests — verifies that APIs with internal state
 * (listeners, subscriptions, settings) behave correctly through their
 * lifecycle: subscribe → mutate → notify → unsubscribe.
 *
 * Targets: AppState, Appearance, DeviceEventEmitter, I18nManager, Settings,
 *          Image static methods, Share, AppRegistry, processColor edge cases.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AppState,
  Appearance,
  DeviceEventEmitter,
  I18nManager,
  Settings,
  Image,
  Share,
  AppRegistry,
  processColor,
  Systrace,
  DevSettings,
} from "react-native";

// ---------------------------------------------------------------------------
// AppState — lifecycle state transitions
// ---------------------------------------------------------------------------

describe("AppState lifecycle (conformance)", () => {
  beforeEach(() => {
    (AppState as any)._reset();
  });

  it("defaults to 'active'", () => {
    expect(AppState.currentState).toBe("active");
  });

  it("_setState updates currentState", () => {
    (AppState as any)._setState("background");
    expect(AppState.currentState).toBe("background");
  });

  it("_setState notifies 'change' listeners", () => {
    const handler = vi.fn();
    AppState.addEventListener("change", handler);
    (AppState as any)._setState("inactive");
    expect(handler).toHaveBeenCalledWith("inactive");
  });

  it("multiple listeners all fire", () => {
    const a = vi.fn();
    const b = vi.fn();
    AppState.addEventListener("change", a);
    AppState.addEventListener("change", b);
    (AppState as any)._setState("background");
    expect(a).toHaveBeenCalledWith("background");
    expect(b).toHaveBeenCalledWith("background");
  });

  it("remove() stops listener from firing", () => {
    const handler = vi.fn();
    const sub = AppState.addEventListener("change", handler);
    sub.remove();
    (AppState as any)._setState("background");
    expect(handler).not.toHaveBeenCalled();
  });

  it("_reset restores state and clears listeners", () => {
    const handler = vi.fn();
    AppState.addEventListener("change", handler);
    (AppState as any)._setState("background");
    (AppState as any)._reset();
    expect(AppState.currentState).toBe("active");
    (AppState as any)._setState("inactive");
    expect(handler).toHaveBeenCalledTimes(1); // only the first call
  });

  it("isAvailable is true", () => {
    expect(AppState.isAvailable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Appearance — color scheme transitions
// ---------------------------------------------------------------------------

describe("Appearance color scheme (conformance)", () => {
  beforeEach(() => {
    (Appearance as any)._reset();
  });

  it("defaults to 'light'", () => {
    expect(Appearance.getColorScheme()).toBe("light");
  });

  it("setColorScheme changes the scheme", () => {
    Appearance.setColorScheme("dark");
    expect(Appearance.getColorScheme()).toBe("dark");
  });

  it("setColorScheme notifies change listeners", () => {
    const handler = vi.fn();
    Appearance.addChangeListener(handler);
    Appearance.setColorScheme("dark");
    expect(handler).toHaveBeenCalledWith({ colorScheme: "dark" });
  });

  it("multiple listeners all fire on change", () => {
    const a = vi.fn();
    const b = vi.fn();
    Appearance.addChangeListener(a);
    Appearance.addChangeListener(b);
    Appearance.setColorScheme("dark");
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("remove() stops listener", () => {
    const handler = vi.fn();
    const sub = Appearance.addChangeListener(handler);
    sub.remove();
    Appearance.setColorScheme("dark");
    expect(handler).not.toHaveBeenCalled();
  });

  it("_reset restores light scheme and clears listeners", () => {
    const handler = vi.fn();
    Appearance.addChangeListener(handler);
    Appearance.setColorScheme("dark");
    (Appearance as any)._reset();
    expect(Appearance.getColorScheme()).toBe("light");
    Appearance.setColorScheme("dark");
    expect(handler).toHaveBeenCalledTimes(1); // only first call
  });
});

// ---------------------------------------------------------------------------
// DeviceEventEmitter — pub/sub event system
// ---------------------------------------------------------------------------

describe("DeviceEventEmitter (conformance)", () => {
  beforeEach(() => {
    (DeviceEventEmitter as any)._reset();
  });

  it("emit fires registered listeners", () => {
    const handler = vi.fn();
    DeviceEventEmitter.addListener("myEvent", handler);
    DeviceEventEmitter.emit("myEvent", "arg1", 42);
    expect(handler).toHaveBeenCalledWith("arg1", 42);
  });

  it("multiple listeners for same event all fire", () => {
    const a = vi.fn();
    const b = vi.fn();
    DeviceEventEmitter.addListener("evt", a);
    DeviceEventEmitter.addListener("evt", b);
    DeviceEventEmitter.emit("evt", "data");
    expect(a).toHaveBeenCalledWith("data");
    expect(b).toHaveBeenCalledWith("data");
  });

  it("subscription.remove stops that listener", () => {
    const a = vi.fn();
    const b = vi.fn();
    const subA = DeviceEventEmitter.addListener("evt", a);
    DeviceEventEmitter.addListener("evt", b);
    subA.remove();
    DeviceEventEmitter.emit("evt");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it("removeListener removes specific handler", () => {
    const handler = vi.fn();
    DeviceEventEmitter.addListener("evt", handler);
    DeviceEventEmitter.removeListener("evt", handler);
    DeviceEventEmitter.emit("evt");
    expect(handler).not.toHaveBeenCalled();
  });

  it("removeAllListeners(event) removes only that event", () => {
    const a = vi.fn();
    const b = vi.fn();
    DeviceEventEmitter.addListener("evtA", a);
    DeviceEventEmitter.addListener("evtB", b);
    DeviceEventEmitter.removeAllListeners("evtA");
    DeviceEventEmitter.emit("evtA");
    DeviceEventEmitter.emit("evtB");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it("removeAllListeners() clears everything", () => {
    const a = vi.fn();
    const b = vi.fn();
    DeviceEventEmitter.addListener("evtA", a);
    DeviceEventEmitter.addListener("evtB", b);
    DeviceEventEmitter.removeAllListeners();
    DeviceEventEmitter.emit("evtA");
    DeviceEventEmitter.emit("evtB");
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("listenerCount returns correct count", () => {
    expect(DeviceEventEmitter.listenerCount("evt")).toBe(0);
    DeviceEventEmitter.addListener("evt", vi.fn());
    DeviceEventEmitter.addListener("evt", vi.fn());
    expect(DeviceEventEmitter.listenerCount("evt")).toBe(2);
  });

  it("emit with no listeners does not throw", () => {
    expect(() => DeviceEventEmitter.emit("noListeners")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// I18nManager — RTL state management
// ---------------------------------------------------------------------------

describe("I18nManager (conformance)", () => {
  beforeEach(() => {
    (I18nManager as any)._reset();
  });

  it("defaults to LTR (isRTL = false)", () => {
    expect(I18nManager.isRTL).toBe(false);
  });

  it("forceRTL(true) sets isRTL to true", () => {
    I18nManager.forceRTL(true);
    expect(I18nManager.isRTL).toBe(true);
  });

  it("forceRTL(false) sets isRTL to false", () => {
    I18nManager.forceRTL(true);
    I18nManager.forceRTL(false);
    expect(I18nManager.isRTL).toBe(false);
  });

  it("doLeftAndRightSwapInRTL defaults to true", () => {
    expect(I18nManager.doLeftAndRightSwapInRTL).toBe(true);
  });

  it("swapLeftAndRightInRTL updates the value", () => {
    I18nManager.swapLeftAndRightInRTL(false);
    expect(I18nManager.doLeftAndRightSwapInRTL).toBe(false);
  });

  it("getConstants reflects current state", () => {
    I18nManager.forceRTL(true);
    I18nManager.swapLeftAndRightInRTL(false);
    const c = I18nManager.getConstants();
    expect(c.isRTL).toBe(true);
    expect(c.doLeftAndRightSwapInRTL).toBe(false);
  });

  it("allowRTL is callable", () => {
    expect(() => I18nManager.allowRTL(true)).not.toThrow();
  });

  it("_reset restores defaults", () => {
    I18nManager.forceRTL(true);
    I18nManager.swapLeftAndRightInRTL(false);
    (I18nManager as any)._reset();
    expect(I18nManager.isRTL).toBe(false);
    expect(I18nManager.doLeftAndRightSwapInRTL).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Settings — key/value persistence
// ---------------------------------------------------------------------------

describe("Settings persistence (conformance)", () => {
  it("set stores multiple keys", () => {
    Settings.set({ a: 1, b: "two", c: true });
    expect(Settings.get("a")).toBe(1);
    expect(Settings.get("b")).toBe("two");
    expect(Settings.get("c")).toBe(true);
  });

  it("set overwrites existing values", () => {
    Settings.set({ key: "first" });
    Settings.set({ key: "second" });
    expect(Settings.get("key")).toBe("second");
  });

  it("set merges with existing settings", () => {
    Settings.set({ x: 1 });
    Settings.set({ y: 2 });
    expect(Settings.get("x")).toBe(1);
    expect(Settings.get("y")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Image static methods
// ---------------------------------------------------------------------------

describe("Image static methods (conformance)", () => {
  it("getSize calls success callback with width and height", async () => {
    const success = vi.fn();
    Image.getSize("https://example.com/img.png", success);
    // getSize uses Promise.resolve().then() so we need to flush microtasks
    await new Promise((r) => setTimeout(r, 0));
    expect(success).toHaveBeenCalledWith(100, 100);
  });

  it("getSizeWithHeaders calls success callback", async () => {
    const success = vi.fn();
    (Image as any).getSizeWithHeaders(
      "https://example.com/img.png",
      { Authorization: "Bearer token" },
      success,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(success).toHaveBeenCalledWith(100, 100);
  });

  it("prefetch returns a promise that resolves to true", async () => {
    const result = await Image.prefetch("https://example.com/img.png");
    expect(result).toBe(true);
  });

  it("queryCache returns a promise with empty object", async () => {
    const result = await (Image as any).queryCache(["https://example.com/img.png"]);
    expect(result).toEqual({});
  });

  it("resolveAssetSource returns uri for number source", () => {
    const result = Image.resolveAssetSource(42);
    expect(result).toEqual({ uri: "asset://42", width: 100, height: 100 });
  });

  it("resolveAssetSource returns object source as-is", () => {
    const source = { uri: "https://example.com/img.png" };
    expect(Image.resolveAssetSource(source)).toBe(source);
  });
});

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

describe("Share (conformance)", () => {
  it("share returns promise with sharedAction", async () => {
    const result = await Share.share({ message: "hello" });
    expect(result).toEqual({ action: "sharedAction" });
  });

  it("sharedAction constant matches result action", async () => {
    const result = await Share.share({ message: "test" });
    expect(result.action).toBe(Share.sharedAction);
  });

  it("dismissedAction is 'dismissedAction'", () => {
    expect(Share.dismissedAction).toBe("dismissedAction");
  });
});

// ---------------------------------------------------------------------------
// AppRegistry
// ---------------------------------------------------------------------------

describe("AppRegistry (conformance)", () => {
  it("registerComponent is callable", () => {
    expect(() => AppRegistry.registerComponent("App", () => () => null)).not.toThrow();
  });

  it("getAppKeys returns empty array", () => {
    expect(AppRegistry.getAppKeys()).toEqual([]);
  });

  it("registerHeadlessTask is callable", () => {
    expect(() =>
      AppRegistry.registerHeadlessTask("Task", () => async () => {}),
    ).not.toThrow();
  });

  it("runApplication is callable", () => {
    expect(() =>
      AppRegistry.runApplication("App", { initialProps: {}, rootTag: 1 }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// processColor edge cases
// ---------------------------------------------------------------------------

describe("processColor edge cases (conformance)", () => {
  it("returns null for null", () => {
    expect(processColor(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(processColor(undefined)).toBeNull();
  });

  it("passes through numeric values", () => {
    expect(processColor(0xffff0000)).toBe(0xffff0000);
  });

  it("#RRGGBBAA with 50% alpha", () => {
    // #FF000080 → alpha=0x80, rgb=0xFF0000 → 0x80FF0000
    const result = processColor("#FF000080");
    expect(result).toBe(0x80ff0000 >>> 0);
  });

  it("#RGB shorthand expands correctly", () => {
    // #F00 → #FF0000 → 0xFFFF0000
    expect(processColor("#F00")).toBe(0xffff0000 >>> 0);
  });

  it("rgb() format", () => {
    expect(processColor("rgb(255, 0, 0)")).toBe(0xffff0000 >>> 0);
  });

  it("rgba() with 0 alpha", () => {
    expect(processColor("rgba(255, 0, 0, 0)")).toBe(0x00ff0000 >>> 0);
  });

  it("rgba() with 1 alpha", () => {
    expect(processColor("rgba(255, 0, 0, 1)")).toBe(0xffff0000 >>> 0);
  });

  it("rgba() with fractional alpha", () => {
    // alpha = 0.5 → round(0.5 * 255) = 128 = 0x80
    expect(processColor("rgba(0, 0, 0, 0.5)")).toBe(0x80000000 >>> 0);
  });

  it("case insensitive named colors", () => {
    expect(processColor("RED")).toBe(processColor("red"));
    expect(processColor("Blue")).toBe(processColor("blue"));
  });

  it("trims whitespace", () => {
    expect(processColor("  red  ")).toBe(processColor("red"));
  });

  it("unknown string returns opaque black", () => {
    expect(processColor("notacolor")).toBe(0xff000000);
  });
});

// ---------------------------------------------------------------------------
// Misc registry exports
// ---------------------------------------------------------------------------

describe("Systrace (conformance)", () => {
  it("beginEvent/endEvent are callable", () => {
    expect(() => Systrace.beginEvent("test")).not.toThrow();
    expect(() => Systrace.endEvent()).not.toThrow();
  });

  it("beginAsyncEvent returns a number", () => {
    expect(typeof Systrace.beginAsyncEvent("async")).toBe("number");
  });

  it("isEnabled returns false", () => {
    expect(Systrace.isEnabled()).toBe(false);
  });
});

describe("DevSettings (conformance)", () => {
  it("addMenuItem is callable", () => {
    expect(() => DevSettings.addMenuItem("test", vi.fn())).not.toThrow();
  });

  it("reload is callable", () => {
    expect(() => DevSettings.reload()).not.toThrow();
  });
});
