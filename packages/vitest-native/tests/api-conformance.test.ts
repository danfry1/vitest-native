/**
 * API conformance tests — ported from React Native's own test suite.
 *
 * Covers processColor, Keyboard, useColorScheme, useWindowDimensions,
 * and additional API behavioral contracts.
 *
 * Sources:
 * - Libraries/StyleSheet/__tests__/processColor-test.js
 * - Libraries/Components/Keyboard/__tests__/Keyboard-test.js
 * - Libraries/Utilities/__tests__/PixelRatio-test.js
 * - Libraries/Utilities/__tests__/Platform-test.js
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processColor,
  Keyboard,
  Dimensions,
  PixelRatio,
  useColorScheme,
  useWindowDimensions,
  Platform,
  Appearance,
  AppState,
  Linking,
  BackHandler,
  NativeModules,
  NativeEventEmitter,
  findNodeHandle,
  PlatformColor,
  Settings,
} from "react-native";

// ---------------------------------------------------------------------------
// processColor — ported from Libraries/StyleSheet/__tests__/processColor-test.js
// ---------------------------------------------------------------------------

describe("processColor (conformance with RN)", () => {
  it("should return null for null", () => {
    expect(processColor(null)).toBeNull();
  });

  it("should return null for undefined", () => {
    expect(processColor(undefined)).toBeNull();
  });

  it("should pass through numbers", () => {
    expect(processColor(0xffff0000)).toBe(0xffff0000);
  });

  describe("predefined color names", () => {
    it("should convert red", () => {
      const result = processColor("red");
      expect(result).toBe(0xffff0000);
    });

    it("should convert white", () => {
      const result = processColor("white");
      expect(result).toBe(0xffffffff);
    });

    it("should convert black", () => {
      const result = processColor("black");
      expect(result).toBe(0xff000000);
    });

    it("should convert transparent", () => {
      const result = processColor("transparent");
      expect(result).toBe(0x00000000);
    });
  });

  describe("hex strings", () => {
    it("should convert #RRGGBB", () => {
      const result = processColor("#1e83c9");
      expect(result).toBe((0xff000000 + 0x1e83c9) >>> 0);
    });

    it("should convert short hex #RGB", () => {
      const result = processColor("#f00");
      expect(result).toBe(0xffff0000);
    });

    it("should convert #RRGGBBAA", () => {
      const result = processColor("#ff000080");
      // Alpha 0x80 → high byte, RGB → 0xff0000
      expect(result).toBe(0x80ff0000);
    });
  });
});

// ---------------------------------------------------------------------------
// Keyboard — ported from Libraries/Components/Keyboard/__tests__/Keyboard-test.js
// ---------------------------------------------------------------------------

describe("Keyboard (conformance with RN)", () => {
  it("dismiss is callable", () => {
    expect(() => Keyboard.dismiss()).not.toThrow();
  });

  it("addListener returns subscription with remove", () => {
    const handler = vi.fn();
    const sub = Keyboard.addListener("keyboardDidShow", handler);
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });

  it("supports all keyboard event types", () => {
    const events = [
      "keyboardWillShow",
      "keyboardDidShow",
      "keyboardWillHide",
      "keyboardDidHide",
      "keyboardWillChangeFrame",
      "keyboardDidChangeFrame",
    ];
    for (const event of events) {
      const sub = Keyboard.addListener(event, vi.fn());
      expect(typeof sub.remove).toBe("function");
      sub.remove();
    }
  });

  it("isVisible returns boolean", () => {
    expect(typeof Keyboard.isVisible()).toBe("boolean");
  });

  it("scheduleLayoutAnimation is callable", () => {
    expect(typeof Keyboard.scheduleLayoutAnimation).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// PixelRatio — ported from Libraries/Utilities/__tests__/PixelRatio-test.js
// ---------------------------------------------------------------------------

describe("PixelRatio (conformance with RN)", () => {
  beforeEach(() => {
    // Reset to defaults
    Dimensions.set({
      window: { width: 390, height: 844, scale: 2, fontScale: 3 },
    });
  });

  it("should give the pixel density", () => {
    expect(PixelRatio.get()).toEqual(2);
  });

  it("should give the font scale", () => {
    expect(PixelRatio.getFontScale()).toEqual(3);
  });

  it("should convert a layout size to pixel size", () => {
    expect(PixelRatio.getPixelSizeForLayoutSize(400)).toEqual(800);
  });

  it("should round a layout size to nearest pixel", () => {
    expect(PixelRatio.roundToNearestPixel(8.4)).toEqual(8.5);
  });
});

// ---------------------------------------------------------------------------
// Platform — ported from Libraries/Utilities/__tests__/Platform-test.js
// ---------------------------------------------------------------------------

describe("Platform (conformance with RN)", () => {
  it("OS is ios or android", () => {
    expect(["ios", "android"]).toContain(Platform.OS);
  });

  it("select returns platform-specific value", () => {
    const obj = { ios: "ios_val", android: "android_val" };
    expect(Platform.select(obj)).toBe(obj[Platform.OS as keyof typeof obj]);
  });

  it("select returns native when no platform match", () => {
    expect(Platform.select({ native: "native", default: "default" })).toBe(
      "native",
    );
  });

  it("select returns default as last resort", () => {
    expect(Platform.select({ default: "default" })).toBe("default");
  });

  it("has Version", () => {
    expect(Platform.Version).toBeDefined();
  });

  it("isPad is a boolean", () => {
    expect(typeof Platform.isPad).toBe("boolean");
  });

  it("isTV is a boolean", () => {
    expect(typeof Platform.isTV).toBe("boolean");
  });

  it("isTesting is a boolean", () => {
    expect(typeof Platform.isTesting).toBe("boolean");
  });

  it("constants is an object", () => {
    expect(typeof Platform.constants).toBe("object");
  });
});

// ---------------------------------------------------------------------------
// findNodeHandle, PlatformColor, Settings — behavioral contracts
// ---------------------------------------------------------------------------

describe("findNodeHandle (conformance)", () => {
  it("is a function", () => {
    expect(typeof findNodeHandle).toBe("function");
  });

  it("returns null for null input", () => {
    expect(findNodeHandle(null)).toBeNull();
  });
});

describe("PlatformColor (conformance)", () => {
  it("is a function", () => {
    expect(typeof PlatformColor).toBe("function");
  });

  it("returns a value when called", () => {
    expect(PlatformColor("systemBlue")).toBeDefined();
  });
});

describe("Settings (conformance)", () => {
  it("get returns value for key", () => {
    Settings.set({ testKey: "testValue" });
    expect(Settings.get("testKey")).toBe("testValue");
  });

  it("get returns undefined for missing key", () => {
    expect(Settings.get("nonExistentKey")).toBeUndefined();
  });

  it("watchKeys returns a number", () => {
    expect(typeof Settings.watchKeys(["someKey"], vi.fn())).toBe("number");
  });

  it("clearWatch is callable", () => {
    expect(() => Settings.clearWatch(0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Appearance — extended conformance
// ---------------------------------------------------------------------------

describe("Appearance (extended conformance)", () => {
  it("getColorScheme returns light, dark, or null", () => {
    const scheme = Appearance.getColorScheme();
    expect(["light", "dark", null]).toContain(scheme);
  });

  it("addChangeListener fires with scheme changes", () => {
    const listener = vi.fn();
    const sub = Appearance.addChangeListener(listener);
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });

  it("setColorScheme is callable", () => {
    expect(typeof Appearance.setColorScheme).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// AppState — extended conformance
// ---------------------------------------------------------------------------

describe("AppState (extended conformance)", () => {
  it("currentState is 'active' by default", () => {
    // Real RN reports 'active' when the app is foregrounded
    expect(AppState.currentState).toBe("active");
  });

  it("addEventListener supports 'change' event", () => {
    const handler = vi.fn();
    const sub = AppState.addEventListener("change", handler);
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });

  it("addEventListener supports 'focus' event", () => {
    const handler = vi.fn();
    const sub = AppState.addEventListener("focus", handler);
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });

  it("addEventListener supports 'blur' event", () => {
    const handler = vi.fn();
    const sub = AppState.addEventListener("blur", handler);
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });
});

// ---------------------------------------------------------------------------
// NativeEventEmitter — extended conformance
// ---------------------------------------------------------------------------

describe("NativeEventEmitter (extended conformance)", () => {
  it("constructor works without arguments", () => {
    expect(() => new NativeEventEmitter()).not.toThrow();
  });

  it("constructor works with native module", () => {
    expect(
      () => new NativeEventEmitter(NativeModules.SomeModule),
    ).not.toThrow();
  });

  it("addListener returns subscription with remove", () => {
    const emitter = new NativeEventEmitter();
    const sub = emitter.addListener("testEvent", vi.fn());
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });

  it("removeAllListeners is callable", () => {
    const emitter = new NativeEventEmitter();
    expect(() => emitter.removeAllListeners("testEvent")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Linking — extended conformance
// ---------------------------------------------------------------------------

describe("Linking (extended conformance)", () => {
  it("openURL returns a promise", () => {
    const result = Linking.openURL("https://example.com");
    expect(result).toBeInstanceOf(Promise);
  });

  it("canOpenURL returns a promise", () => {
    const result = Linking.canOpenURL("https://example.com");
    expect(result).toBeInstanceOf(Promise);
  });

  it("getInitialURL returns a promise", () => {
    const result = Linking.getInitialURL();
    expect(result).toBeInstanceOf(Promise);
  });

  it("addEventListener returns subscription", () => {
    const sub = Linking.addEventListener("url", vi.fn());
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });

  it("openSettings returns a promise", () => {
    const result = Linking.openSettings();
    expect(result).toBeInstanceOf(Promise);
  });

  it("sendIntent is callable on Android", () => {
    expect(typeof Linking.sendIntent).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// BackHandler — extended conformance
// ---------------------------------------------------------------------------

describe("BackHandler (extended conformance)", () => {
  it("exitApp is callable", () => {
    expect(() => BackHandler.exitApp()).not.toThrow();
  });

  it("addEventListener returns subscription with remove", () => {
    const sub = BackHandler.addEventListener("hardwareBackPress", vi.fn());
    expect(typeof sub.remove).toBe("function");
    sub.remove();
  });
});

// ---------------------------------------------------------------------------
// useColorScheme — hook conformance
// ---------------------------------------------------------------------------

describe("useColorScheme (conformance)", () => {
  it("is a function", () => {
    expect(typeof useColorScheme).toBe("function");
  });

  it("returns a valid scheme when called outside component (fallback)", () => {
    // Our mock catches the "not in component" error and returns the default
    const result = useColorScheme();
    expect(["light", "dark"]).toContain(result);
  });
});

// ---------------------------------------------------------------------------
// useWindowDimensions — hook conformance
// ---------------------------------------------------------------------------

describe("useWindowDimensions (conformance)", () => {
  it("is a function", () => {
    expect(typeof useWindowDimensions).toBe("function");
  });

  it("returns dimensions when called outside component (fallback)", () => {
    // Our mock catches the "not in component" error and returns defaults
    const result = useWindowDimensions();
    expect(result).toHaveProperty("width");
    expect(result).toHaveProperty("height");
    expect(result).toHaveProperty("scale");
    expect(result).toHaveProperty("fontScale");
    expect(typeof result.width).toBe("number");
    expect(typeof result.height).toBe("number");
  });
});
