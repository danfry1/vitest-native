import { VitestNativeError } from "./errors.mjs";
/**
 * Test helpers for vitest-native.
 *
 * These functions mutate the live mock instances created by the setup file.
 * Import from 'vitest-native/helpers' in your test files.
 */

function getMock(): Record<string, any> {
  const mock = (globalThis as any).__vitest_native_mock;
  if (!mock) {
    throw new VitestNativeError(
      "HELPERS_BEFORE_SETUP",
      "helpers were called before setup ran. Ensure the vitest-native plugin is configured.",
    );
  }
  return mock;
}

function getNativeControl(): Record<string, (...args: any[]) => any> | null {
  return (globalThis as any).__vitest_native_control ?? null;
}

/** The original NativeModules instance, stored so resetAllMocks() can restore it. */
let originalNativeModules: Record<string, any> | null = null;

export function setPlatform(os: "ios" | "android"): void {
  const native = getNativeControl();
  if (native) return native.setPlatform(os);
  const mock = getMock();
  const platform = mock.Platform;
  platform.OS = os;
  platform.Version = os === "ios" ? "17.0" : 34;
  platform.select.mockImplementation((specifics: Record<string, any>) => {
    return specifics[os] ?? specifics.default;
  });
}

export function setDimensions(dims: {
  width: number;
  height: number;
  scale?: number;
  fontScale?: number;
}): void {
  const native = getNativeControl();
  if (native) return native.setDimensions(dims);
  const mock = getMock();

  // Update Dimensions.get()
  mock.Dimensions.set({
    window: dims,
    screen: dims,
  });

  // Update useWindowDimensions hook
  if (mock.useWindowDimensions._setDimensions) {
    mock.useWindowDimensions._setDimensions(dims);
  }
}

export function setColorScheme(scheme: "light" | "dark" | null): void {
  const native = getNativeControl();
  if (native) return native.setColorScheme(scheme);
  const mock = getMock();
  const resolved = scheme ?? "light";

  // Update Appearance.getColorScheme()
  mock.Appearance.setColorScheme(resolved);

  // Update useColorScheme hook
  if (mock.useColorScheme._setScheme) {
    mock.useColorScheme._setScheme(resolved);
  }
}

export function setInsets(insets: {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}): void {
  const presetMocks = (globalThis as any).__vitest_native_preset_mocks;
  const safeArea = presetMocks?.["react-native-safe-area-context"];
  if (safeArea?._setInsets) {
    safeArea._setInsets(insets);
  }
}

export function mockNativeModule(name: string, impl: Record<string, any>): void {
  const native = getNativeControl();
  if (native) return native.mockNativeModule(name, impl);
  const mock = getMock();

  // Store the original NativeModules on first call so resetAllMocks() can restore it
  if (originalNativeModules === null) {
    originalNativeModules = mock.NativeModules;
  }

  // NativeModules is a Proxy — we replace it with a version that has our module
  const existing = mock.NativeModules;
  const handler: ProxyHandler<Record<string, any>> = {
    get(target, prop) {
      if (prop === name) return impl;
      if (typeof prop === "symbol") return undefined;
      return (
        Reflect.get(target, prop) ??
        new Proxy(
          {},
          {
            get(_, p) {
              if (typeof p === "symbol") return undefined;
              return () => {};
            },
          },
        )
      );
    },
  };
  mock.NativeModules = new Proxy(existing, handler);
}

function clearMockFns(obj: Record<string, any>, visited = new Set()): void {
  if (!obj || typeof obj !== "object" || visited.has(obj)) return;
  visited.add(obj);
  for (const [_key, value] of Object.entries(obj)) {
    if (typeof value === "function" && "mockClear" in value) {
      value.mockClear();
    }
    if (typeof value === "object" && value !== null) {
      clearMockFns(value, visited);
    }
  }
}

export function resetAllMocks(): void {
  const native = getNativeControl();
  if (native) return native.resetAllMocks();
  const mock = getMock();
  clearMockFns(mock);

  // Reset Platform
  mock.Platform.OS = "ios";
  mock.Platform.Version = "17.0";
  mock.Platform.select.mockImplementation((specifics: Record<string, any>) => {
    return specifics.ios ?? specifics.default;
  });

  // Every mock exposing `_reset` — Dimensions, Appearance, Keyboard, AppState,
  // BackHandler, I18nManager and the event emitters — in one sweep.
  //
  // This was a hand-maintained list of seven, and it had already fallen behind:
  // NativeAppEventEmitter is a SECOND emitter instance (the registry builds one per
  // name, so it is not the DeviceEventEmitter object), and nothing reset it. A
  // listener registered on it survived resetAllMocks and fired in the next test.
  // Enumerating instead means a stateful mock added later is covered on arrival.
  for (const value of Object.values(mock)) {
    const candidate = value as { _reset?: unknown } | null;
    if (candidate && typeof candidate === "object" && typeof candidate._reset === "function") {
      (candidate._reset as () => void)();
    }
  }

  // These two take their resting value as an argument, so they are not `_reset` and
  // the sweep above does not reach them.
  if (mock.useWindowDimensions._resetDimensions) {
    mock.useWindowDimensions._resetDimensions({ width: 390, height: 844, scale: 3, fontScale: 1 });
  } else if (mock.useWindowDimensions._setDimensions) {
    mock.useWindowDimensions._setDimensions({ width: 390, height: 844, scale: 3, fontScale: 1 });
  }

  if (mock.useColorScheme._resetScheme) {
    mock.useColorScheme._resetScheme("light");
  } else if (mock.useColorScheme._setScheme) {
    mock.useColorScheme._setScheme("light");
  }

  // Restore original NativeModules (undoes all mockNativeModule() calls)
  if (originalNativeModules !== null) {
    mock.NativeModules = originalNativeModules;
    originalNativeModules = null;
  }

  // Reset preset mocks (AsyncStorage store, safe area insets, etc.)
  const presetMocks = (globalThis as any).__vitest_native_preset_mocks;
  if (presetMocks) {
    for (const mod of Object.values(presetMocks) as any[]) {
      if (mod?._reset) mod._reset();
      if (mod?._resetStore) mod._resetStore();
    }
  }
}
