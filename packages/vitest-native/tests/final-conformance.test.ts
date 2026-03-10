/**
 * Final conformance tests — covers the last untested mock files
 * to achieve comprehensive coverage across all mocks.
 *
 * Targets: PermissionsAndroid, TurboModuleRegistry, NativeComponentRegistry,
 *          NativeEventEmitter (emit/listenerCount), requireNativeComponent,
 *          ActionSheetIOS, Pressable accessibility merging.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react-native";
import { PermissionsAndroid, NativeEventEmitter, ActionSheetIOS, Pressable } from "react-native";

// Access internals via the registry for non-exported mocks
import {
  createTurboModuleRegistryMock,
  createNativeComponentRegistryMock,
  createRequireNativeComponentMock,
} from "../src/mocks/registry.js";

// ---------------------------------------------------------------------------
// PermissionsAndroid
// ---------------------------------------------------------------------------

describe("PermissionsAndroid (conformance)", () => {
  it("PERMISSIONS contains standard Android permissions", () => {
    expect(PermissionsAndroid.PERMISSIONS.CAMERA).toBe("android.permission.CAMERA");
    expect(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION).toBe(
      "android.permission.ACCESS_FINE_LOCATION",
    );
    expect(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).toBe("android.permission.RECORD_AUDIO");
    expect(PermissionsAndroid.PERMISSIONS.READ_CONTACTS).toBe("android.permission.READ_CONTACTS");
    expect(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).toBe(
      "android.permission.POST_NOTIFICATIONS",
    );
  });

  it("RESULTS has granted, denied, never_ask_again", () => {
    expect(PermissionsAndroid.RESULTS.GRANTED).toBe("granted");
    expect(PermissionsAndroid.RESULTS.DENIED).toBe("denied");
    expect(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN).toBe("never_ask_again");
  });

  it("check resolves to true", async () => {
    const result = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    expect(result).toBe(true);
  });

  it("request resolves to 'granted'", async () => {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    expect(result).toBe("granted");
  });

  it("requestMultiple resolves with all permissions granted", async () => {
    const perms = [
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ];
    const result = await PermissionsAndroid.requestMultiple(perms);
    expect(result).toEqual({
      "android.permission.CAMERA": "granted",
      "android.permission.RECORD_AUDIO": "granted",
    });
  });

  it("PERMISSIONS has all expected keys", () => {
    const keys = Object.keys(PermissionsAndroid.PERMISSIONS);
    expect(keys.length).toBeGreaterThan(20);
    // Spot check a few more
    expect(keys).toContain("BLUETOOTH_CONNECT");
    expect(keys).toContain("WRITE_EXTERNAL_STORAGE");
    expect(keys).toContain("READ_MEDIA_IMAGES");
  });
});

// ---------------------------------------------------------------------------
// NativeEventEmitter — full lifecycle
// ---------------------------------------------------------------------------

describe("NativeEventEmitter lifecycle (conformance)", () => {
  it("emit fires listener with args", () => {
    const emitter = new NativeEventEmitter();
    const handler = vi.fn();
    emitter.addListener("test", handler);
    emitter.emit("test", "a", 1, true);
    expect(handler).toHaveBeenCalledWith("a", 1, true);
  });

  it("multiple listeners on same event", () => {
    const emitter = new NativeEventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.addListener("evt", a);
    emitter.addListener("evt", b);
    emitter.emit("evt", "data");
    expect(a).toHaveBeenCalledWith("data");
    expect(b).toHaveBeenCalledWith("data");
  });

  it("subscription.remove stops that listener", () => {
    const emitter = new NativeEventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    const subA = emitter.addListener("evt", a);
    emitter.addListener("evt", b);
    subA.remove();
    emitter.emit("evt");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it("removeAllListeners(event) clears only that event", () => {
    const emitter = new NativeEventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.addListener("x", a);
    emitter.addListener("y", b);
    emitter.removeAllListeners("x");
    emitter.emit("x");
    emitter.emit("y");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it("removeAllListeners() clears everything", () => {
    const emitter = new NativeEventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.addListener("x", a);
    emitter.addListener("y", b);
    emitter.removeAllListeners();
    emitter.emit("x");
    emitter.emit("y");
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("listenerCount returns correct count", () => {
    const emitter = new NativeEventEmitter();
    expect(emitter.listenerCount("evt")).toBe(0);
    emitter.addListener("evt", vi.fn());
    emitter.addListener("evt", vi.fn());
    expect(emitter.listenerCount("evt")).toBe(2);
  });

  it("emit with no listeners does not throw", () => {
    const emitter = new NativeEventEmitter();
    expect(() => emitter.emit("noListeners")).not.toThrow();
  });

  it("different instances have separate listener sets", () => {
    const e1 = new NativeEventEmitter();
    const e2 = new NativeEventEmitter();
    const h1 = vi.fn();
    const h2 = vi.fn();
    e1.addListener("evt", h1);
    e2.addListener("evt", h2);
    e1.emit("evt");
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TurboModuleRegistry
// ---------------------------------------------------------------------------

describe("TurboModuleRegistry (conformance)", () => {
  const registry = createTurboModuleRegistryMock();

  it("getEnforcing returns a proxy object", () => {
    const mod = registry.getEnforcing("SomeModule");
    expect(mod).toBeDefined();
    expect(typeof mod).toBe("object");
  });

  it("proxy methods are callable", () => {
    const mod = registry.getEnforcing("SomeModule");
    // Any property access returns a function
    expect(typeof mod.someMethod).toBe("function");
    expect(typeof mod.anotherMethod).toBe("function");
    expect(() => mod.someMethod()).not.toThrow();
  });

  it("get returns null", () => {
    expect(registry.get("SomeModule")).toBeNull();
  });

  it("proxy does not trigger promise detection", () => {
    const mod = registry.getEnforcing("Mod");
    // 'then' should be undefined so the proxy isn't treated as a thenable
    expect(mod.then).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// NativeComponentRegistry
// ---------------------------------------------------------------------------

describe("NativeComponentRegistry (conformance)", () => {
  const registry = createNativeComponentRegistryMock();

  it("get returns a React component", () => {
    const Component = registry.get("RCTView");
    expect(Component).toBeDefined();
    expect(typeof Component).toBe("object"); // forwardRef
  });

  it("get sets displayName from component name", () => {
    const Component = registry.get("RCTText");
    expect(Component.displayName).toBe("RCTText");
  });

  it("getWithFallback works same as get", () => {
    const Component = registry.getWithFallback("RCTImage");
    expect(Component.displayName).toBe("RCTImage");
  });

  it("returned component renders", () => {
    const MyNative = registry.get("MyNativeView");
    render(React.createElement(MyNative, { testID: "native" }));
    expect(screen.getByTestId("native")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// requireNativeComponent
// ---------------------------------------------------------------------------

describe("requireNativeComponent (conformance)", () => {
  const requireNativeComponent = createRequireNativeComponentMock();

  it("returns a React component", () => {
    const Component = requireNativeComponent("RCTWebView");
    expect(Component).toBeDefined();
  });

  it("sets displayName from view name", () => {
    const Component = requireNativeComponent("RCTMapView");
    expect(Component.displayName).toBe("RCTMapView");
  });

  it("returned component renders with props", () => {
    const MapView = requireNativeComponent("RCTMapView");
    render(React.createElement(MapView, { testID: "map", region: {} }));
    expect(screen.getByTestId("map")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ActionSheetIOS
// ---------------------------------------------------------------------------

describe("ActionSheetIOS (conformance)", () => {
  it("showActionSheetWithOptions is callable", () => {
    expect(() =>
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancel", "Delete"], cancelButtonIndex: 0 },
        vi.fn(),
      ),
    ).not.toThrow();
  });

  it("showShareActionSheetWithOptions is callable", () => {
    expect(() =>
      ActionSheetIOS.showShareActionSheetWithOptions(
        { url: "https://example.com" },
        vi.fn(),
        vi.fn(),
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Pressable — accessibility state merging
// ---------------------------------------------------------------------------

describe("Pressable accessibility (conformance)", () => {
  it("is accessible by default", () => {
    render(React.createElement(Pressable, { testID: "press" }));
    expect(screen.getByTestId("press").props.accessible).toBe(true);
  });

  it("disabled prop sets accessibilityState.disabled", () => {
    render(React.createElement(Pressable, { testID: "press", disabled: true }));
    expect(screen.getByTestId("press").props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  it("merges disabled with existing accessibilityState", () => {
    render(
      React.createElement(Pressable, {
        testID: "press",
        disabled: true,
        accessibilityState: { selected: true },
      }),
    );
    expect(screen.getByTestId("press").props.accessibilityState).toEqual({
      selected: true,
      disabled: true,
    });
  });

  it("no accessibilityState when not disabled and none provided", () => {
    render(React.createElement(Pressable, { testID: "press" }));
    expect(screen.getByTestId("press").props.accessibilityState).toBeUndefined();
  });

  it("passes through accessibilityState when not disabled", () => {
    render(
      React.createElement(Pressable, {
        testID: "press",
        accessibilityState: { expanded: true },
      }),
    );
    expect(screen.getByTestId("press").props.accessibilityState).toEqual({
      expanded: true,
    });
  });
});
