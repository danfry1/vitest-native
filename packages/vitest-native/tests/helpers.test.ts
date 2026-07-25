import { describe, it, expect, afterEach, vi } from "vitest";
import * as RN from "react-native";
import {
  AppState,
  Appearance,
  BackHandler,
  DeviceEventEmitter,
  Dimensions,
  I18nManager,
  Keyboard,
  Platform,
} from "react-native";
import { setPlatform, setDimensions, setColorScheme, resetAllMocks } from "../src/helpers.js";

afterEach(() => {
  resetAllMocks();
});

describe("setPlatform", () => {
  it("changes Platform.OS", () => {
    setPlatform("android");
    expect(Platform.OS).toBe("android");
    expect(Platform.select({ ios: "a", android: "b" })).toBe("b");
  });

  it("resets back to ios", () => {
    setPlatform("android");
    resetAllMocks();
    expect(Platform.OS).toBe("ios");
  });
});

describe("setDimensions", () => {
  it("changes Dimensions.get()", () => {
    setDimensions({ width: 768, height: 1024 });
    const dims = Dimensions.get("window");
    expect(dims.width).toBe(768);
    expect(dims.height).toBe(1024);
  });
});

describe("setColorScheme", () => {
  it("changes Appearance.getColorScheme()", () => {
    setColorScheme("dark");
    expect(Appearance.getColorScheme()).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
// resetAllMocks covers every stateful mock
// ---------------------------------------------------------------------------

/**
 * `resetAllMocks()` is the state-hygiene tool users call in `beforeEach`, and its
 * per-mock reset calls were unobserved: disabling any one of the seven below left the
 * whole suite green, so it could silently stop resetting a mock and user tests would
 * start interfering with each other instead.
 *
 * The tests below dirty each mock and assert the reset restores it. The last one is
 * the structural guard: it spies on every `_reset` the React Native mock exposes, so a
 * stateful mock added later and forgotten here fails rather than leaking quietly.
 */
describe("resetAllMocks", () => {
  it("restores Dimensions and clears its listeners", () => {
    const listener = vi.fn();
    Dimensions.addEventListener("change", listener);
    setDimensions({ width: 1, height: 2 });
    resetAllMocks();
    expect(Dimensions.get("window").width).toBe(390);
    // setDimensions above fires the listener; only calls AFTER the reset matter.
    listener.mockClear();
    Dimensions.set({
      window: { width: 5, height: 6, scale: 1, fontScale: 1 },
      screen: { width: 5, height: 6, scale: 1, fontScale: 1 },
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it("restores the Appearance colour scheme", () => {
    setColorScheme("dark");
    resetAllMocks();
    expect(Appearance.getColorScheme()).toBe("light");
  });

  it("restores AppState and clears its listeners", () => {
    const listener = vi.fn();
    AppState.addEventListener("change", listener);
    (AppState as unknown as { _setState: (s: string) => void })._setState("background");
    resetAllMocks();
    expect(AppState.currentState).toBe("active");
    // _setState above fires the listener; only calls AFTER the reset matter.
    listener.mockClear();
    (AppState as unknown as { _setState: (s: string) => void })._setState("inactive");
    expect(listener).not.toHaveBeenCalled();
  });

  it("restores Keyboard visibility", () => {
    (Keyboard as unknown as { _show: (h?: number) => void })._show(300);
    expect(Keyboard.isVisible()).toBe(true);
    resetAllMocks();
    expect(Keyboard.isVisible()).toBe(false);
    expect(Keyboard.metrics()).toBe(undefined);
  });

  it("restores I18nManager to LTR", () => {
    I18nManager.forceRTL(true);
    I18nManager.swapLeftAndRightInRTL(false);
    resetAllMocks();
    expect(I18nManager.isRTL).toBe(false);
    expect(I18nManager.doLeftAndRightSwapInRTL).toBe(true);
  });

  it("clears DeviceEventEmitter listeners", () => {
    const listener = vi.fn();
    DeviceEventEmitter.addListener("vn-helper-event", listener);
    resetAllMocks();
    DeviceEventEmitter.emit("vn-helper-event");
    expect(listener).not.toHaveBeenCalled();
  });

  it("clears BackHandler listeners", () => {
    const listener = vi.fn(() => true);
    BackHandler.addEventListener("hardwareBackPress", listener);
    resetAllMocks();
    (BackHandler as unknown as { mockPressBack?: () => void }).mockPressBack?.();
    expect(listener).not.toHaveBeenCalled();
  });

  it("calls _reset on every stateful mock the module exposes", () => {
    // Structural: a stateful mock added later that resetAllMocks forgets fails here,
    // rather than leaking state into the next test silently.
    const stateful = Object.entries(RN as unknown as Record<string, unknown>).filter(
      ([, value]) =>
        value !== null &&
        typeof value === "object" &&
        typeof (value as { _reset?: unknown })._reset === "function",
    );
    expect(stateful.length).toBeGreaterThan(0);

    const spies = stateful.map(([name, value]) => {
      const target = value as { _reset: () => void };
      return [name, vi.spyOn(target, "_reset")] as const;
    });
    resetAllMocks();
    const missed = spies.filter(([, spy]) => spy.mock.calls.length === 0).map(([name]) => name);
    for (const [, spy] of spies) spy.mockRestore();
    expect(missed).toEqual([]);
  });
});
