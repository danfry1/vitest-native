import { describe, it, expect, afterEach } from "vitest";
import { Platform, Dimensions, Appearance } from "react-native";
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
