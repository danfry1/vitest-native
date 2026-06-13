import { describe, expect, it } from "vitest";
import { Platform } from "react-native";
import { selectedPlatform } from "./fixtures/platform";

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
});
