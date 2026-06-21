// The native control surface's resetAllMocks(): contract.test.ts uses it in
// afterEach but never asserts it actually restores state. These verify the
// isolation guarantee — that setDimensions/setColorScheme/mockNativeModule are
// all undone by resetAllMocks() so state doesn't leak between tests.
import { afterEach, describe, expect, it } from "vitest";
import { Appearance, Dimensions, NativeModules } from "react-native";
import {
  mockNativeModule,
  resetAllMocks,
  setColorScheme,
  setDimensions,
} from "vitest-native/helpers";

afterEach(() => {
  resetAllMocks();
});

describe("native engine: resetAllMocks restores driven state", () => {
  it("restores Dimensions to their initial value", () => {
    const initial = Dimensions.get("window");
    setDimensions({ width: 111, height: 222, scale: 1, fontScale: 1 });
    expect(Dimensions.get("window").width).toBe(111);

    resetAllMocks();

    expect(Dimensions.get("window")).toMatchObject({
      width: initial.width,
      height: initial.height,
    });
  });

  it("restores the color scheme", () => {
    setColorScheme("dark");
    expect(Appearance.getColorScheme()).toBe("dark");

    resetAllMocks();

    expect(Appearance.getColorScheme()).not.toBe("dark");
  });

  it("removes an injected native module", () => {
    mockNativeModule("VitestResetProbe", { ping: () => "pong" });
    expect(NativeModules.VitestResetProbe.ping()).toBe("pong");

    resetAllMocks();

    // The injected implementation is gone (the module is undefined or, at most, a
    // permissive stub — either way `ping()` no longer returns the injected value).
    expect(NativeModules.VitestResetProbe?.ping?.()).not.toBe("pong");
  });
});
