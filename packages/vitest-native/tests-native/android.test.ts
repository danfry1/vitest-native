import { describe, expect, it } from "vitest";
import { Platform } from "react-native";
import { selectedPlatform } from "./fixtures/platform";
import { marker } from "./fixtures/plat/marker";
import { nativeOnly } from "./fixtures/plat/nativeonly";

describe("native engine: Android platform", () => {
  it("loads Android React Native and application modules", () => {
    expect(Platform.OS).toBe("android");
    expect(Platform.select({ ios: "ios", android: "android" })).toBe("android");
    expect(selectedPlatform).toBe("android");
  });

  it("provides Android-shaped platform constants", () => {
    expect(Platform.Version).toBe(34);
    expect(Platform.constants.systemName).toBeUndefined();
    expect(Platform.constants.reactNativeVersion.minor).toBeGreaterThan(0);
  });

  it("prefers the .android variant over .native and the base file", () => {
    // Same fixtures as platform-resolution.test.ts (iOS): proves platform-specific
    // resolution wins over `.native`, which wins over the base, on Android too.
    expect(marker).toBe("android");
    expect(nativeOnly).toBe("native");
  });
});
